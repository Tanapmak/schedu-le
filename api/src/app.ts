import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { addMember, Conflict, LastAdmin, listTeam, parseMember, updateMember, type Member } from './team.js';
import { authConfig, authenticate, isManager, requireManager, requireMasterAdmin, type AuthConfig } from './auth.js';
import { BadRequest, parseDate, parseId, parseSessionInput } from './input.js';
import { webDist } from './paths.js';
import { adjustAttendance, clockIn, clockOut, dayAttendance, decideAttendance, listStudios, myAttendance, saveStudio, type Fix } from './attendance.js';
import { correctableSessions, decideCorrection, listCorrections, requestCorrection, withdrawCorrection } from './corrections.js';
import { BadHistory, loadHistory, performanceScores } from './performance.js';
import { addPreference, isMonthKey, latestPreferences, myPreferences } from './preferences.js';
import { AiFailed, claudeWishReader, defaultPool, planSchedule, type WishReader } from './autoSchedule.js';
import { copyRows, importRows, importTemplate, readSheet, saveDrafts } from './bulk.js';
import { payrollWorkbook } from './export.js';
import { hoursReport, isMonth } from './hours.js';
import { canRecord, deleteResult, listResults, parseResultInput, saveResult, suggestNewBroadcast } from './results.js';
import { claudeReader, type ImageMediaType, type ScreenshotReader } from './vision.js';
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

export interface AppOptions {
  /** Reads live-dashboard screenshots. Undefined when no AI key is set: results are typed in by hand. */
  readScreenshot?: ScreenshotReader;
  /** Turns the admin's free-text scheduling wishes into rules. Undefined when no AI key is set. */
  readWishes?: WishReader;
}

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export function createApp(pool: pg.Pool, auth: AuthConfig = authConfig(), opts: AppOptions = { readScreenshot: claudeReader() }) {
  const app = express();
  const readWishes = 'readWishes' in opts ? opts.readWishes : claudeWishReader();
  // Screenshots arrive as base64 data URLs (the web app shrinks them to ~2000 px first).
  app.use(express.json({ limit: '8mb' }));

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
    res.json({ user: req.user, mode: auth.mode, devUsers, aiReader: Boolean(opts.readScreenshot), aiPlanner: Boolean(readWishes) });
  });

  app.get('/api/rooms', async (_req, res) => {
    res.json(await listRooms(pool));
  });

  app.get('/api/people', async (_req, res) => {
    res.json(await listPeople(pool));
  });

  // ---- Team list and roles (master admin only). People are archived, never deleted,
  // because sessions, leave and results point at them.
  app.get('/api/team', requireMasterAdmin, async (_req, res) => {
    res.json(await listTeam(pool));
  });

  app.post('/api/team', requireMasterAdmin, async (req, res) => {
    await teamWrite(res, () => addMember(pool, parseMember(req.body), req.user!.id));
  });

  app.put('/api/team/:id', requireMasterAdmin, async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const input = parseMember(req.body);
    if (id === req.user!.id && (input.role !== 'admin' || !input.isActive)) {
      return void res.status(409).json({ error: 'cannot_demote_self' });
    }
    await teamWrite(res, () => updateMember(pool, id, input, req.user!.id));
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
    const visible = isManager(req.user?.role) ? sessions : sessions.filter((x) => x.status !== 'draft');
    res.json({ sessions: visible, leaves, holidays });
  });

  // Live check while the admin fills the form; saves nothing.
  app.post('/api/sessions/check', requireManager, async (req, res) => {
    const input = parseSessionInput(req.body);
    const id = req.body.id === undefined ? undefined : parseId(req.body.id, 'id');
    const client = await pool.connect();
    try {
      res.json({ violations: await checkAgainstDb(client, { ...input, id, status: 'draft' }) });
    } finally {
      client.release();
    }
  });

  app.post('/api/sessions', requireManager, async (req, res) => {
    const result = await saveSession(pool, parseSessionInput(req.body), { confirm: req.body.confirm === true, actorId: req.user?.id });
    if (result.ok) res.status(201).json(result);
    else res.status(result.status).json(result);
  });

  app.put('/api/sessions/:id', requireManager, async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const result = await saveSession(pool, parseSessionInput(req.body), { id, confirm: req.body.confirm === true });
    res.status(result.ok ? 200 : result.status).json(result);
  });

  app.post('/api/sessions/:id/cancel', requireManager, async (req, res) => {
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
  app.post('/api/sessions/:id/merge', requireManager, async (req, res) => {
    const result = await mergeSessions(pool, parseId(req.params.id, 'id'), parseId(req.body.withId, 'withId'));
    res.status(result.ok ? 200 : 409).json(result);
  });

  // Only drafts can be deleted; published sessions are cancelled so hours and history stay.
  app.delete('/api/sessions/:id', requireManager, async (req, res) => {
    const id = parseId(req.params.id, 'id');
    const { rowCount } = await pool.query(`DELETE FROM sessions WHERE id = $1 AND status = 'draft'`, [id]);
    res.status(rowCount ? 200 : 404).json({ ok: Boolean(rowCount) });
  });

  // Copy a week (or any range) of lives onto other days as drafts, matching weekdays.
  const isoDate = (v: unknown, name: string) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequest(`${name} must be YYYY-MM-DD`);
    return v;
  };
  const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const spanDays = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;

  app.post('/api/sessions/copy', requireManager, async (req, res) => {
    const range = {
      sourceFrom: isoDate(req.body.sourceFrom, 'sourceFrom'),
      sourceTo: isoDate(req.body.sourceTo, 'sourceTo'),
      targetFrom: isoDate(req.body.targetFrom, 'targetFrom'),
      targetTo: isoDate(req.body.targetTo, 'targetTo'),
    };
    const src = spanDays(range.sourceFrom, range.sourceTo);
    const dst = spanDays(range.targetFrom, range.targetTo);
    if (src < 1 || src > 31 || dst < 1 || dst > MAX_RANGE_DAYS) throw new BadRequest('source must be 1-31 days and target 1-62 days');
    if (range.targetFrom <= range.sourceTo && range.targetTo >= range.sourceFrom) throw new BadRequest('target must not overlap the source');
    const rows = await copyRows(pool, range);
    res.json({ rows: await saveDrafts(pool, rows, { dryRun: req.body.dryRun !== false, actorId: req.user?.id }) });
  });

  // Import drafts from the template sheet (xlsx or csv). dryRun (the default) only checks.
  app.get('/api/sessions/import-template', requireManager, async (_req, res) => {
    const wb = await importTemplate(pool);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="schedule-import-template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  });

  app.post('/api/sessions/import', requireManager, async (req, res) => {
    const name = typeof req.body.filename === 'string' ? req.body.filename.toLowerCase() : '';
    const kind = name.endsWith('.csv') ? 'csv' : name.endsWith('.xlsx') ? 'xlsx' : null;
    if (!kind || typeof req.body.data !== 'string') throw new BadRequest('upload an .xlsx or .csv file');
    let sheet;
    try {
      sheet = await readSheet(Buffer.from(req.body.data.replace(/^data:[^,]*,/, ''), 'base64'), kind);
    } catch {
      throw new BadRequest('could not read the file');
    }
    if (sheet.length === 0) throw new BadRequest('the file has no rows');
    if (sheet.length > 1000) throw new BadRequest('at most 1000 rows per file');
    const rows = await importRows(pool, sheet);
    res.json({ rows: await saveDrafts(pool, rows, { dryRun: req.body.dryRun !== false, actorId: req.user?.id }) });
  });

  // AI scheduling: slots from a pattern week, MC/PD chosen by the solver, wishes read by Claude.
  // Nothing is saved here; the admin checks the plan, then sends the sessions to /save.
  app.get('/api/schedule/auto/defaults', requireManager, async (_req, res) => {
    const { lives } = await performanceScores(pool);
    res.json({
      peopleIds: (await listPeople(pool)).filter(defaultPool).map((p) => p.id),
      aiPlanner: Boolean(readWishes),
      performanceLives: lives,
    });
  });

  // Past lives from before the app (the cleaned history CSV), replacing what was loaded before.
  app.post('/api/performance/history', requireManager, async (req, res) => {
    if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) throw new BadRequest('send the CSV text as csv');
    try {
      res.json(await loadHistory(pool, req.body.csv));
    } catch (err) {
      if (err instanceof BadHistory) throw new BadRequest(err.message);
      throw err;
    }
  });

  // Everyone's own scheduling wishes. Each person edits theirs; managers read all of them.
  app.get('/api/preferences/me', async (req, res) => {
    res.json(await myPreferences(pool, req.user!.id));
  });

  // Each send is a new entry (the history is kept); the month says which month it is for.
  app.post('/api/preferences/me', async (req, res) => {
    if (!isMonthKey(req.body.month)) throw new BadRequest('month must be YYYY-MM');
    if (typeof req.body.text !== 'string' || !req.body.text.trim()) throw new BadRequest('text must not be empty');
    const text = req.body.text.trim();
    if (text.length > 2000) throw new BadRequest('at most 2000 characters');
    res.status(201).json({ id: await addPreference(pool, req.user!.id, req.body.month, text) });
  });

  // Managers: everyone's latest entry per month in [from, to] (default: one month).
  app.get('/api/preferences', requireManager, async (req, res) => {
    const from = req.query.from ?? req.query.month;
    const to = req.query.to ?? from;
    if (!isMonthKey(from) || !isMonthKey(to) || to < from) throw new BadRequest('from/to must be YYYY-MM');
    res.json(await latestPreferences(pool, from, to));
  });

  app.post('/api/schedule/auto', requireManager, async (req, res) => {
    const request = {
      sourceFrom: isoDate(req.body.sourceFrom, 'sourceFrom'),
      targetFrom: isoDate(req.body.targetFrom, 'targetFrom'),
      targetTo: isoDate(req.body.targetTo, 'targetTo'),
      peopleIds: Array.isArray(req.body.peopleIds) ? req.body.peopleIds.map((v: unknown, i: number) => parseId(v, `peopleIds[${i}]`)) : [],
      maxDayHours: Number(req.body.maxDayHours ?? 8),
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions.slice(0, 4000) : '',
      usePreferences: req.body.usePreferences !== false,
      usePerformance: req.body.usePerformance !== false,
    };
    const dst = spanDays(request.targetFrom, request.targetTo);
    if (dst < 1 || dst > MAX_RANGE_DAYS) throw new BadRequest('target must be 1-62 days');
    if (request.targetFrom <= addDaysIso(request.sourceFrom, 6) && request.targetTo >= request.sourceFrom) throw new BadRequest('target must not overlap the pattern week');
    if (!Number.isFinite(request.maxDayHours) || request.maxDayHours < 2 || request.maxDayHours > 16) throw new BadRequest('maxDayHours must be 2-16');
    if (request.peopleIds.length === 0) throw new BadRequest('pick at least one person');
    let plan;
    try {
      plan = await planSchedule(pool, request, readWishes);
    } catch (err) {
      if (err instanceof AiFailed) {
        console.error('AI scheduling failed', err.cause);
        return void res.status(502).json({ error: 'ai_failed' });
      }
      throw err;
    }
    const rows = await saveDrafts(pool, plan.rows, { dryRun: true });
    res.json({ ...plan, rows });
  });

  app.post('/api/schedule/auto/save', requireManager, async (req, res) => {
    if (!Array.isArray(req.body.sessions) || req.body.sessions.length === 0) throw new BadRequest('sessions must be a non-empty array');
    if (req.body.sessions.length > 2000) throw new BadRequest('at most 2000 sessions');
    const rows = req.body.sessions.map((s: unknown, i: number) => ({ row: i + 1, problems: [], input: parseSessionInput(s) }));
    res.json({ rows: await saveDrafts(pool, rows, { dryRun: false, actorId: req.user?.id }) });
  });

  // Publishes every draft that starts in [from, to).
  app.post('/api/publish', requireManager, async (req, res) => {
    const from = parseDate(req.body.from, 'from');
    const to = parseDate(req.body.to, 'to');
    const { rowCount } = await pool.query(
      `UPDATE sessions SET status = 'published' WHERE status = 'draft' AND lower(period) >= $1 AND lower(period) < $2`,
      [from, to],
    );
    res.json({ published: rowCount });
  });

  // ---- Hours vs KPI for a month. The team sees only their own row.
  app.get('/api/hours', async (req, res) => {
    if (!isMonth(req.query.month)) throw new BadRequest('month must be YYYY-MM');
    const rows = await hoursReport(pool, req.query.month);
    res.json({ month: req.query.month, rows: isManager(req.user!.role) ? rows : rows.filter((r) => r.personId === req.user!.id) });
  });

  // ---- Payroll workbook (hours, KPI, results, freelance lives). No pay rates are stored in the app.
  app.get('/api/export/payroll', requireManager, async (req, res) => {
    if (!isMonth(req.query.month)) throw new BadRequest('month must be YYYY-MM');
    const wb = await payrollWorkbook(pool, req.query.month);
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="schedu-le-payroll-${req.query.month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  // ---- Live results. The AI reads a screenshot into a draft; nothing is saved until the PD confirms.
  app.post('/api/results/read', async (req, res) => {
    const sessionId = parseId(req.body.sessionId, 'sessionId');
    const { session, allowed } = await canRecord(pool, sessionId, req.user!);
    if (!session) return void res.status(404).json({ error: 'not_found' });
    if (!allowed) return void res.status(403).json({ error: 'not_your_session' });
    if (!opts.readScreenshot) return void res.status(503).json({ error: 'ai_not_configured' });
    const m = typeof req.body.image === 'string' ? IMAGE_DATA_URL.exec(req.body.image) : null;
    if (!m) throw new BadRequest('image must be a base64 data URL (png, jpeg, webp or gif)');
    let reading;
    try {
      reading = await opts.readScreenshot({ mediaType: m[1] as ImageMediaType, base64: m[2] });
    } catch (err) {
      console.error('screenshot read failed', err);
      return void res.status(502).json({ error: 'ai_failed' });
    }
    // The dashboard shows Bangkok time without a zone.
    const started = reading.live_started_at && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(reading.live_started_at)
      ? new Date(`${reading.live_started_at.replace(' ', 'T')}:00+07:00`)
      : null;
    const liveStartedAt = started && !Number.isNaN(started.getTime()) ? started : null;
    const isNewBroadcast = await suggestNewBroadcast(pool, session, liveStartedAt);
    res.json({ reading, liveStartedAt, isNewBroadcast });
  });

  // Suggests the Session Flag for a hand-typed reading.
  app.get('/api/results/flag', async (req, res) => {
    const sessionId = parseId(req.query.sessionId, 'sessionId');
    const { session } = await canRecord(pool, sessionId, req.user!);
    if (!session) return void res.status(404).json({ error: 'not_found' });
    const started = req.query.liveStartedAt ? parseDate(req.query.liveStartedAt, 'liveStartedAt') : null;
    res.json({ isNewBroadcast: await suggestNewBroadcast(pool, session, started) });
  });

  app.post('/api/results', async (req, res) => {
    const sessionId = parseId(req.body.sessionId, 'sessionId');
    const { session, allowed } = await canRecord(pool, sessionId, req.user!);
    if (!session) return void res.status(404).json({ error: 'not_found' });
    if (!allowed) return void res.status(403).json({ error: 'not_your_session' });
    const input = { ...parseResultInput(req.body), sessionId };
    const id = await saveResult(pool, session.roomId, input, req.user!.id);
    res.status(201).json({ ok: true, id });
  });

  app.get('/api/results', async (req, res) => {
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new BadRequest('bad range');
    res.json(await listResults(pool, from, to));
  });

  app.delete('/api/results/:id', async (req, res) => {
    const ok = await deleteResult(pool, parseId(req.params.id, 'id'), req.user!);
    res.status(ok ? 200 : 404).json({ ok });
  });

  // ---- Leave: MC/PD file for themselves, the admin may file for anyone and decides.
  app.get('/api/leave', async (req, res) => {
    const isAdmin = isManager(req.user!.role);
    const mine = req.query.mine === '1' || !isAdmin;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const from = req.query.from ? parseDate(req.query.from, 'from') : undefined;
    const to = req.query.to ? parseDate(req.query.to, 'to') : undefined;
    res.json(await listLeave(pool, { personId: mine ? req.user!.id : undefined, status, from, to }));
  });

  app.post('/api/leave', async (req, res) => {
    const isAdmin = isManager(req.user!.role);
    const personId = isAdmin && req.body.personId !== undefined ? parseId(req.body.personId, 'personId') : req.user!.id;
    const kind = req.body.kind === 'urgent' ? 'urgent' : 'normal';
    const input = { personId, start: parseDate(req.body.start, 'start'), end: parseDate(req.body.end, 'end'), kind, reason: text(req.body.reason) } as const;
    send(res, await fileLeave(pool, input, { confirm: req.body.confirm === true, actorId: req.user!.id }), true);
  });

  app.post('/api/leave/:id/decision', requireManager, async (req, res) => {
    const out = await decideLeave(pool, parseId(req.params.id, 'id'), decisionOf(req.body.decision), {
      confirm: req.body.confirm === true,
      actorId: req.user!.id,
    });
    send(res, out);
  });

  app.post('/api/leave/:id/withdraw', async (req, res) => {
    const ok = await withdrawLeave(pool, parseId(req.params.id, 'id'), { id: req.user!.id, isAdmin: isManager(req.user!.role) });
    res.status(ok ? 200 : 404).json({ ok });
  });

  // ---- Shift swaps: hand my place to someone, or trade places with them; the admin approves.
  app.get('/api/swaps', async (req, res) => {
    const isAdmin = isManager(req.user!.role);
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

  app.post('/api/swaps/:id/decision', requireManager, async (req, res) => {
    const out = await decideSwap(pool, parseId(req.params.id, 'id'), decisionOf(req.body.decision), {
      confirm: req.body.confirm === true,
      actorId: req.user!.id,
    });
    send(res, out);
  });

  app.post('/api/swaps/:id/withdraw', async (req, res) => {
    const ok = await withdrawSwap(pool, parseId(req.params.id, 'id'), { id: req.user!.id, isAdmin: isManager(req.user!.role) });
    res.status(ok ? 200 : 404).json({ ok });
  });

  // ---- Team off days (holidays). They block sessions; existing sessions on the day are reported back.
  app.get('/api/holidays', async (req, res) => {
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (to <= from || to.getTime() - from.getTime() > 400 * 86_400_000) throw new BadRequest('bad range');
    res.json(await holidaysBetween(pool, from, to));
  });

  app.post('/api/holidays', requireManager, async (req, res) => {
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

  app.delete('/api/holidays/:id', requireManager, async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM holidays WHERE id = $1', [parseId(req.params.id, 'id')]);
    res.status(rowCount ? 200 : 404).json({ ok: Boolean(rowCount) });
  });

  // Clock in / out. Location is the browser's GPS fix; without one, the person gives a reason.
  const fixOf = (b: any): Fix | null => {
    const lat = Number(b?.lat);
    const lng = Number(b?.lng);
    if (b?.lat == null || b?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };

  app.get('/api/attendance/me', async (req, res) => {
    const now = new Date();
    const [mine, correctable, corrections] = await Promise.all([
      myAttendance(pool, req.user!.id, now),
      correctableSessions(pool, req.user!.id, now),
      listCorrections(pool, req.user!.id),
    ]);
    res.json({ ...mine, correctable, corrections });
  });

  // Time corrections for a forgotten clock in/out. Asked from the session's place; managers decide.
  const timeOf = (v: unknown, name: string) => {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new BadRequest(`${name} must be a date-time`);
    return d;
  };

  app.get('/api/attendance/corrections', async (req, res) => {
    res.json(await listCorrections(pool, isManager(req.user!.role) ? null : req.user!.id));
  });

  app.post('/api/attendance/corrections', async (req, res) => {
    const reason = text(req.body.reason);
    if (!reason) throw new BadRequest('reason is required');
    const out = await requestCorrection(
      pool,
      req.user!.id,
      {
        sessionId: parseId(req.body.sessionId, 'sessionId'),
        clockInAt: timeOf(req.body.clockInAt, 'clockInAt'),
        clockOutAt: timeOf(req.body.clockOutAt, 'clockOutAt'),
        reason,
      },
      fixOf(req.body),
      new Date(),
    );
    res.status(out.ok ? 201 : out.status).json(out);
  });

  app.post('/api/attendance/corrections/:id/decision', requireManager, async (req, res) => {
    const out = await decideCorrection(pool, parseId(req.params.id, 'id'), decisionOf(req.body.decision), req.user!.id);
    res.status(out.ok ? 200 : out.status).json(out);
  });

  app.post('/api/attendance/corrections/:id/withdraw', async (req, res) => {
    const ok = await withdrawCorrection(pool, parseId(req.params.id, 'id'), req.user!.id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  app.post('/api/attendance/clock-in', async (req, res) => {
    const out = await clockIn(pool, req.user!.id, fixOf(req.body), text(req.body.reason), new Date());
    res.status(out.ok ? 201 : out.status).json(out);
  });

  app.post('/api/attendance/clock-out', async (req, res) => {
    const out = await clockOut(pool, req.user!.id, fixOf(req.body), new Date());
    res.status(out.ok ? 200 : out.status).json(out);
  });

  app.get('/api/attendance', requireManager, async (req, res) => {
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
    if (!date) throw new BadRequest('date must be YYYY-MM-DD');
    res.json(await dayAttendance(pool, date, new Date()));
  });

  app.post('/api/attendance/:id/decision', requireManager, async (req, res) => {
    const ok = await decideAttendance(pool, parseId(req.params.id, 'id'), decisionOf(req.body.decision), req.user!.id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  app.post('/api/attendance/:id/adjust', requireManager, async (req, res) => {
    const raw = req.body.hours;
    const hours = raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) throw new BadRequest('hours must be 0 to 24');
    const ok = await adjustAttendance(pool, parseId(req.params.id, 'id'), hours, text(req.body.note), req.user!.id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  app.get('/api/studios', async (_req, res) => {
    res.json(await listStudios(pool));
  });

  app.post('/api/studios', requireManager, async (req, res) => {
    const at = fixOf(req.body);
    const name = text(req.body.name);
    const radiusM = Math.round(Number(req.body.radiusM ?? 100));
    if (!at || !name || !(radiusM >= 10 && radiusM <= 5000)) throw new BadRequest('name, lat, lng and radiusM (10-5000) are required');
    const id = await saveStudio(pool, { id: req.body.id ? parseId(req.body.id, 'id') : undefined, name, ...at, radiusM });
    res.json({ ok: true, id });
  });

  async function teamWrite(res: Response, save: () => Promise<Member | undefined>) {
    try {
      const member = await save();
      if (!member) return void res.status(404).json({ error: 'not_found' });
      res.json(member);
    } catch (err) {
      if (err instanceof Conflict) return void res.status(409).json({ error: err.message, field: err.field });
      if (err instanceof LastAdmin) return void res.status(409).json({ error: 'last_admin' });
      throw err;
    }
  }

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
