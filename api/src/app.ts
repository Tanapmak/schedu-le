import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { BadRequest, parseDate, parseId, parseSessionInput } from './input.js';
import { webDist } from './paths.js';
import { checkAgainstDb, mergeSessions, saveSession } from './sessions.js';
import { holidaysBetween, leavesBetween, listPeople, listRooms, sessionsBetween } from './store.js';

const MAX_RANGE_DAYS = 62;

export function createApp(pool: pg.Pool) {
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
    res.json({ sessions, leaves, holidays });
  });

  // Live check while the admin fills the form; saves nothing.
  app.post('/api/sessions/check', async (req, res) => {
    const input = parseSessionInput(req.body);
    const id = req.body.id === undefined ? undefined : parseId(req.body.id, 'id');
    const client = await pool.connect();
    try {
      res.json({ violations: await checkAgainstDb(client, { ...input, id, status: 'draft' }) });
    } finally {
      client.release();
    }
  });

  app.post('/api/sessions', async (req, res) => {
    const result = await saveSession(pool, parseSessionInput(req.body), { confirm: req.body.confirm === true });
    if (result.ok) res.status(201).json(result);
    else res.status(result.status).json(result);
  });

  app.put('/api/sessions/:id', async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const result = await saveSession(pool, parseSessionInput(req.body), { id, confirm: req.body.confirm === true });
    res.status(result.ok ? 200 : result.status).json(result);
  });

  app.post('/api/sessions/:id/cancel', async (req, res) => {
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
  app.post('/api/sessions/:id/merge', async (req, res) => {
    const result = await mergeSessions(pool, parseId(req.params.id, 'id'), parseId(req.body.withId, 'withId'));
    res.status(result.ok ? 200 : 409).json(result);
  });

  // Only drafts can be deleted; published sessions are cancelled so hours and history stay.
  app.delete('/api/sessions/:id', async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const { rowCount } = await pool.query(`DELETE FROM sessions WHERE id = $1 AND status = 'draft'`, [id]);
    res.status(rowCount ? 200 : 404).json({ ok: Boolean(rowCount) });
  });

  // Publishes every draft that starts in [from, to).
  app.post('/api/publish', async (req, res) => {
    const from = parseDate(req.body.from, 'from');
    const to = parseDate(req.body.to, 'to');
    const { rowCount } = await pool.query(
      `UPDATE sessions SET status = 'published' WHERE status = 'draft' AND lower(period) >= $1 AND lower(period) < $2`,
      [from, to],
    );
    res.json({ published: rowCount });
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
