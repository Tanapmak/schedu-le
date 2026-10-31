import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { authConfig, authenticate, requireAdmin, type AuthConfig } from './auth.js';
import { BadRequest, parseDate, parseId, parseSessionInput } from './input.js';
import { webDist } from './paths.js';
import { decideLeave, decideSwap, fileLeave, fileSwap, listLeave, listSwaps, withdrawLeave, withdrawSwap, type Outcome } from './requests.js';
import { checkAgainstDb, mergeSessions, saveSession } from './sessions.js';
import { holidaysBetween, leavesBetween, listPeople, listRooms, sessionsBetween } from './store.js';

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const decisionOf = (v: unknown) => {
  if (v !== 'approve' && v !== 'reject') throw new BadRequest('decision must be approve or reject');
  return v;
};
const send = (res: Response, out: Outcome, created = false) => res.status(out.ok ? (created ? 201 : 200) : out.status).json(out);

const MAX_RANGE_DAYS = 62;

export function createApp(pool: pg.Pool, auth: AuthConfig = authConfig()) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  // Everything below needs a signed-in team member.
  app.use('/api', authenticate(pool, auth));

  app.get('/api/me', async (req, res) => {
    // In dev mode the web app shows a switcher to try each role.
    const devUsers =
      auth.mode === 'dev'
        ? (await pool.query(`SELECT nickname, email, app_role AS role FROM people WHERE is_active AND email IS NOT NULL ORDER BY id`)).rows
        : undefined;
    res.json({ user: req.user, mode: auth.mode, devUsers });
  });

  app.get('/api/rooms', async (_req, res) => {
    res.json(await listRooms(pool));
  });

  app.get('/api/people', async (_req, res) => {
    res.json(await listPeople(pool));
  });

  // Everything the board needs for a date range: sessions, leave and holidays.
  app.get('/api/board', async (req, res) => {
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new BadRequest(`to must be after from and at most ${MAX_RANGE_DAYS} days later`);
    }
    const [sessions, leaves, holidays] = await Promise.all([
      sessionsBetween(pool, from, to),
      leavesBetween(pool, from, to),
      holidaysBetween(pool, from, to),
    ]);
    // Drafts are the admin's work in progress; the team only sees what is published.
    const visible = req.user?.role === 'admin' ? sessions : sessions.filter((x) => x.status !== 'draft');
    res.json({ sessions: visible, leaves, holidays });
  });

  // Live check while the admin fills the form; saves nothing.
  app.post('/api/sessions/check', requireAdmin, async (req, res) => {
    const input = parseSessionInput(req.body);
    const id = req.body.id === undefined ? undefined : parseId(req.body.id, 'id');
    const client = await pool.connect();
    try {
      res.json({ violations: await checkAgainstDb(client, { ...input, id, status: 'draft' }) });
    } finally {
      client.release();
    }
  });

  app.post('/api/sessions', requireAdmin, async (req, res) => {
    const result = await saveSession(pool, parseSessionInput(req.body), { confirm: req.body.confirm === true, actorId: req.user?.id });
    if (result.ok) res.status(201).json(result);
    else res.status(result.status).json(result);
  });

  app.put('/api/sessions/:id', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const result = await saveSession(pool, parseSessionInput(req.body), { id, confirm: req.body.confirm === true });
    res.status(result.ok ? 200 : result.status).json(result);
  });

  app.post('/api/sessions/:id/cancel', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) throw new BadRequest('reason is required');
    const countHours = req.body.countHours !== false;
    const { rowCount } = await pool.query(
      `UPDATE sessions SET status = 'cancelled', cancel_reason = $2, count_hours_when_cancelled = $3
        WHERE id = $1 AND status <> 'cancelled'`,
      [id, reason, countHours],
    );
    res.status(rowCount ? 200 : 404).json({ ok: Boolean(rowCount) });
  });

  // Joins a back-to-back session (same room, people, status) into this one.
  app.post('/api/sessions/:id/merge', requireAdmin, async (req, res) => {
    const result = await mergeSessions(pool, parseId(req.params.id, 'id'), parseId(req.body.withId, 'withId'));
    res.status(result.ok ? 200 : 409).json(result);
  });

  // Only drafts can be deleted; published sessions are cancelled so hours and history stay.
  app.delete('/api/sessions/:id', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const { rowCount } = await pool.query(`DELETE FROM sessions WHERE id = $1 AND status = 'draft'`, [id]);
    res.status(rowCount ? 200 : 404).json({ ok: Boolean(rowCount) });
  });

  // Publishes every draft that starts in [from, to).
  app.post('/api/publish', requireAdmin, async (req, res) => {
    const from = parseDate(req.body.from, 'from');
    const to = parseDate(req.body.to, 'to');
    const { rowCount } = await pool.query(
      `UPDATE sessions SET status = 'published' WHERE status = 'draft' AND lower(period) >= $1 AND lower(period) < $2`,
      [from, to],
    );
    res.json({ published: rowCount });
  });

  // ---- Leave: MC/PD file for themselves, the admin may file for anyone and decides.
  app.get('/api/leave', async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    const mine = req.query.mine === '1' || !isAdmin;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const from = req.query.from ? parseDate(req.query.from, 'from') : undefined;
    const to = req.query.to ? parseDate(req.query.to, 'to') : undefined;
    res.json(await listLeave(pool, { personId: mine ? req.user!.id : undefined, status, from, to }));
  });

  app.post('/api/leave', async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    const personId = isAdmin && req.body.personId !== undefined ? parseId(req.body.personId, 'personId') : req.user!.id;
    const kind = req.body.kind === 'urgent' ? 'urgent' : 'normal';
    const input = { personId, start: parseDate(req.body.start, 'start'), end: parseDate(req.body.end, 'end'), kind, reason: text(req.body.reason) } as const;
    send(res, await fileLeave(pool, input, { confirm: req.body.confirm === true, actorId: req.user!.id }), true);
  });

  app.post('/api/leave/:id/decision', requireAdmin, async (req, res) => {
    const out = await decideLeave(pool, parseId(req.params.id, 'id'), decisionOf(req.body.decision), {
      confirm: req.body.confirm === true,
      actorId: req.user!.id,
    });
    send(res, out);
  });

  app.post('/api/leave/:id/withdraw', async (req, res) => {
    const ok = await withdrawLeave(pool, parseId(req.params.id, 'id'), { id: req.user!.id, isAdmin: req.user!.role === 'admin' });
    res.status(ok ? 200 : 404).json({ ok });
  });

  // ---- Shift swaps: hand my place to someone, or trade places with them; the admin approves.
  app.get('/api/swaps', async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    const mine = req.query.mine === '1' || !isAdmin;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await listSwaps(pool, { personId: mine ? req.user!.id : undefined, status }));
  });

  app.post('/api/swaps', async (req, res) => {
    const out = await fileSwap(pool, {
      requesterId: req.user!.id,
      sessionId: parseId(req.body.sessionId, 'sessionId'),
      targetId: parseId(req.body.targetId, 'targetId'),
      targetSessionId: req.body.targetSessionId == null ? null : parseId(req.body.targetSessionId, 'targetSessionId'),
      reason: text(req.body.reason),
    });
    send(res, out, true);
  });

  app.post('/api/swaps/:id/decision', requireAdmin, async (req, res) => {
    const out = await decideSwap(pool, parseId(req.params.id, 'id'), decisionOf(req.body.decision), {
      confirm: req.body.confirm === true,
      actorId: req.user!.id,
    });
    send(res, out);
  });

  app.post('/api/swaps/:id/withdraw', async (req, res) => {
    const ok = await withdrawSwap(pool, parseId(req.params.id, 'id'), { id: req.user!.id, isAdmin: req.user!.role === 'admin' });
    res.status(ok ? 200 : 404).json({ ok });
  });

  // ---- Team off days (holidays). They block sessions; existing sessions on the day are reported back.
  app.post('/api/holidays', requireAdmin, async (req, res) => {
    const name = text(req.body.name);
    if (!name) throw new BadRequest('name is required');
    const start = parseDate(req.body.start, 'start');
    const end = parseDate(req.body.end, 'end');
    if (end <= start) throw new BadRequest('end must be after start');
    const { rows } = await pool.query(
      `INSERT INTO holidays (name, period, created_by) VALUES ($1, tstzrange($2, $3), $4) RETURNING id::int`,
      [name, start, end, req.user!.id],
    );
    const clashes = (await sessionsBetween(pool, start, end)).filter((s) => s.status !== 'cancelled');
    res.status(201).json({ ok: true, id: rows[0].id, sessionsOnDay: clashes.map((s) => s.id) });
  });

  app.delete('/api/holidays/:id', requireAdmin, async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM holidays WHERE id = $1', [parseId(req.params.id, 'id')]);
    res.status(rowCount ? 200 : 404).json({ ok: Boolean(rowCount) });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: 'bad_request', message: err.message });
      return;
    }
    next(err);
  });

  // In production the same container serves the built web app.
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  return app;
}
