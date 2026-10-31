import { countsHours, hoursOf, loadRules, type StaffRole } from './rules/index.js';
import { monthRange } from './sessions.js';
import { listPeople, sessionsBetween, type Db, type Employment, type PersonRow } from './store.js';

/**
 * Hours per person for a Bangkok month, compared with KPI.
 * Only regular staff (employment full_time) have a KPI. Guests (retail trainers),
 * freelancers and interns are listed with their hours but no KPI.
 *
 * KPI is measured on hours in the person's own position. Hours in the other role
 * (a PD hosting as MC) have KPI 0, so they are reported separately and count in full.
 */
export interface HoursRow {
  personId: number;
  nickname: string;
  position: PersonRow['position'];
  employment: Employment;
  mcHours: number;
  pdHours: number;
  totalHours: number;
  /** Hours already worked (session ended); the rest of totalHours is still scheduled. */
  doneHours: number;
  /** Cancelled sessions that still count (force majeure, team meetings). */
  cancelledCountedHours: number;
  sessions: number;
  kpiHours: number | null;
  ownRoleHours: number;
  crossRoleHours: number;
  /** ownRoleHours − kpiHours (negative = short of KPI); null when there is no KPI. */
  vsKpi: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (v: unknown): v is string => typeof v === 'string' && MONTH.test(v);

export async function hoursReport(db: Db, month: string, now = new Date()): Promise<HoursRow[]> {
  const { from, to } = monthRange(new Date(`${month}-15T00:00:00+07:00`));
  const rules = await loadRules(db);
  const people = await listPeople(db);
  // Sessions are counted in the month they start in.
  const sessions = (await sessionsBetween(db, from, to)).filter((s) => s.start >= from && s.start < to);

  const acc = new Map<number, { mc: number; pd: number; done: number; cancelled: number; n: number }>();
  for (const s of sessions) {
    for (const st of s.staff) {
      if (!countsHours(s, st.replaced)) continue;
      const a = acc.get(st.personId) ?? { mc: 0, pd: 0, done: 0, cancelled: 0, n: 0 };
      const h = hoursOf(s);
      a[st.role] += h;
      a.n += 1;
      if (s.end <= now) a.done += h;
      if (s.status === 'cancelled') a.cancelled += h;
      acc.set(st.personId, a);
    }
  }

  const rows: HoursRow[] = [];
  for (const p of people) {
    const a = acc.get(p.id);
    if (!a && !p.isActive) continue;
    const mc = a?.mc ?? 0;
    const pd = a?.pd ?? 0;
    const ownRole: StaffRole | null = p.position === 'operation' ? null : p.position;
    const kpi = p.employment === 'full_time' && ownRole ? (p.kpiHours ?? rules.kpiHours[ownRole]) : null;
    const own = ownRole === 'mc' ? mc : ownRole === 'pd' ? pd : 0;
    const cross = ownRole === null ? mc + pd : mc + pd - own;
    rows.push({
      personId: p.id,
      nickname: p.nickname,
      position: p.position,
      employment: p.employment,
      mcHours: round(mc),
      pdHours: round(pd),
      totalHours: round(mc + pd),
      doneHours: round(a?.done ?? 0),
      cancelledCountedHours: round(a?.cancelled ?? 0),
      sessions: a?.n ?? 0,
      kpiHours: kpi,
      ownRoleHours: round(own),
      crossRoleHours: round(cross),
      vsKpi: kpi === null ? null : round(own - kpi),
    });
  }
  const order = { mc: 0, pd: 1, operation: 2 };
  return rows.sort((x, y) => order[x.position] - order[y.position] || x.nickname.localeCompare(y.nickname));
}
