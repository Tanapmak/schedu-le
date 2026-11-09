import { isManager, type AppRole } from './auth.js';
import { FORGOT_RECORD_DEDUCTION, recordCutoff, resultsBySession } from './results.js';
import { bangkokDate, hoursOf } from './rules/time.js';
import { monthRange } from './sessions.js';
import { listPeople, listRooms, sessionsBetween, type Db, type SessionRow } from './store.js';

/**
 * Where a session's result stands:
 * - upcoming: not over yet
 * - recorded: has a reading, first saved before the cut-off
 * - missing: over, no reading yet (fined once the cut-off passes)
 * - late: first reading saved after the cut-off (only admin can do that; still fined)
 * - cancelled: no result needed
 */
export type ResultStatus = 'upcoming' | 'recorded' | 'missing' | 'late' | 'cancelled';

export interface SummarySession {
  id: number;
  start: Date;
  end: Date;
  roomId: number;
  roomCode: string;
  mc: string[];
  pd: string[];
  hours: number;
  gmv: number | null;
  orders: number | null;
  readings: number;
  edited: boolean;
  status: ResultStatus;
  /** People fined if this result is (or stays) missing: the session's PD (recording is the PD's job; never the MC). */
  responsible: number[];
  /** True once the cut-off has passed and the session is missing or late. */
  fined: boolean;
}

type Viewer = { id: number; role: AppRole };

/** One month: the payroll file and the month view use this. */
export async function monthSummary(db: Db, month: string, now: Date, viewer: Viewer) {
  const { from, to } = monthRange(new Date(`${month}-15T00:00:00+07:00`));
  const cutoff = recordCutoff(from);
  return { month, cutoff, closed: now >= cutoff, ...(await rangeSummary(db, from, to, now, viewer)) };
}

/**
 * Live performance for sessions starting in [from, to). The range may cross months:
 * each session follows its own month's cut-off (25th of the next month).
 */
export async function rangeSummary(db: Db, from: Date, to: Date, now: Date, viewer: Viewer) {
  const people = new Map((await listPeople(db)).map((p) => [p.id, p]));
  const rooms = new Map((await listRooms(db)).map((r) => [r.id, r]));
  const manager = isManager(viewer.role);
  let sessions: SessionRow[] = (await sessionsBetween(db, from, to)).filter(
    (s) => s.start >= from && s.start < to && s.status !== 'draft',
  );
  if (!manager) sessions = sessions.filter((s) => s.staff.some((x) => x.personId === viewer.id && !x.replaced));

  const results = await resultsBySession(db, from, to);
  const { rows: meta } = await db.query(
    `SELECT session_id::int AS id, count(*) FILTER (WHERE superseded_at IS NULL)::int AS n,
            bool_or(superseded_at IS NOT NULL) AS edited, min(created_at) AS first
       FROM live_results WHERE session_id = ANY($1::bigint[]) GROUP BY session_id`,
    [sessions.map((s) => s.id)],
  );
  const metaOf = new Map(meta.map((m) => [m.id, m as { n: number; edited: boolean; first: Date }]));

  const nick = (id: number) => people.get(id)?.nickname ?? `#${id}`;
  const list: SummarySession[] = sessions.map((s) => {
    const m = metaOf.get(s.id);
    const staff = s.staff.filter((x) => !x.replaced);
    const status: ResultStatus =
      s.status === 'cancelled' ? 'cancelled'
        : m && m.n > 0 ? (m.first >= recordCutoff(s.start) ? 'late' : 'recorded')
          : s.end > now ? 'upcoming'
            : 'missing';
    const responsible = staff
      .filter((x) => x.role === 'pd' && people.get(x.personId)?.employment !== 'guest')
      .map((x) => x.personId);
    const r = results.get(s.id);
    return {
      id: s.id,
      start: s.start,
      end: s.end,
      roomId: s.roomId,
      roomCode: rooms.get(s.roomId)?.code ?? `#${s.roomId}`,
      mc: staff.filter((x) => x.role === 'mc').map((x) => nick(x.personId)),
      pd: staff.filter((x) => x.role === 'pd').map((x) => nick(x.personId)),
      hours: hoursOf(s),
      gmv: r ? r.gmv : null,
      orders: r ? r.orders : null,
      readings: m?.n ?? 0,
      edited: Boolean(m?.edited),
      status,
      responsible,
      fined: now >= recordCutoff(s.start) && (status === 'missing' || status === 'late'),
    };
  });

  const live = list.filter((s) => s.status !== 'cancelled');
  const ended = live.filter((s) => s.status !== 'upcoming');
  const sum = (xs: SummarySession[], f: (s: SummarySession) => number) => xs.reduce((a, s) => a + f(s), 0);
  const totals = {
    gmv: sum(live, (s) => s.gmv ?? 0),
    orders: sum(live, (s) => s.orders ?? 0),
    hours: sum(ended, (s) => s.hours),
    sessions: live.length,
    ended: ended.length,
    recorded: ended.filter((s) => s.status === 'recorded' || s.status === 'late').length,
    missing: ended.filter((s) => s.status === 'missing').length,
  };

  const byRoom = [...new Set(live.map((s) => s.roomId))]
    .map((roomId) => {
      const xs = live.filter((s) => s.roomId === roomId);
      const done = xs.filter((s) => s.status !== 'upcoming');
      const gmv = sum(xs, (s) => s.gmv ?? 0);
      const hours = sum(done, (s) => s.hours);
      return { roomId, roomCode: xs[0].roomCode, sessions: xs.length, hours, gmv, gmvPerHour: hours ? gmv / hours : null, missing: done.filter((s) => s.status === 'missing').length };
    })
    .sort((a, b) => b.gmv - a.gmv);

  // Per person: own sessions' GMV by role, and missing results they are responsible for.
  const personIds = new Set(sessions.flatMap((s) => s.staff.filter((x) => !x.replaced).map((x) => x.personId)));
  const byPerson = [...personIds]
    .filter((id) => manager || id === viewer.id)
    .map((id) => {
      const on = (role: 'mc' | 'pd') =>
        live.filter((s) => sessions.find((x) => x.id === s.id)!.staff.some((st) => st.personId === id && st.role === role && !st.replaced));
      const mc = on('mc'), pd = on('pd');
      const mine = live.filter((s) => s.responsible.includes(id));
      const missing = mine.filter((s) => s.status === 'missing' || s.status === 'late');
      const fined = missing.filter((s) => s.fined).length;
      return {
        personId: id,
        nickname: nick(id),
        sessions: new Set([...mc, ...pd].map((s) => s.id)).size,
        hours: sum([...mc, ...pd].filter((s) => s.status !== 'upcoming'), (s) => s.hours),
        gmvMc: sum(mc, (s) => s.gmv ?? 0),
        gmvPd: sum(pd, (s) => s.gmv ?? 0),
        missing: missing.length,
        deduction: fined * FORGOT_RECORD_DEDUCTION,
        pendingDeduction: (missing.length - fined) * FORGOT_RECORD_DEDUCTION,
      };
    })
    .sort((a, b) => b.gmvMc + b.gmvPd - (a.gmvMc + a.gmvPd));

  // Every day of the range, so the chart has no gaps (days without a live show as 0).
  const daily = new Map<string, { gmv: number; orders: number; sessions: number }>();
  for (let d = from.getTime(); d < to.getTime(); d += 86_400_000) daily.set(bangkokDate(new Date(d)), { gmv: 0, orders: 0, sessions: 0 });
  for (const s of live) {
    const day = daily.get(bangkokDate(s.start));
    if (!day) continue;
    day.gmv += s.gmv ?? 0;
    day.orders += s.orders ?? 0;
    day.sessions += 1;
  }

  // Each month the range touches, with its record cut-off.
  const months = [...new Set([...daily.keys()].map((d) => d.slice(0, 7)))].map((month) => {
    const cutoff = recordCutoff(new Date(`${month}-15T00:00:00+07:00`));
    return { month, cutoff, closed: now >= cutoff };
  });

  return {
    from,
    to,
    months,
    deductionAmount: FORGOT_RECORD_DEDUCTION,
    totals,
    byRoom,
    byPerson,
    daily: [...daily].map(([date, d]) => ({ date, ...d })),
    sessions: list,
  };
}
