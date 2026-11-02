import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api, type Board as BoardData, type HoursRow, type Person, type Room, type Session, type User, isManager } from './api';
import { t, violationMessage, type Lang } from './i18n';
import { MonthView, addMonths, monthGrid } from './MonthView';
import { AutoSchedule } from './AutoSchedule';
import { BulkTools } from './BulkTools';
import { SessionForm, type FormTarget } from './SessionForm';
import { addDays, bkkDate, bkkInstant, bkkTime, formatDay, minutesFrom, mondayOf, todayBkk, liveDate } from './time';

type View = 'day' | 'week' | 'month';

// Day view spans 06:00 to 02:00 the next morning; early lives start at 06:00, late ones run past midnight.
const DAY_START_H = 6;
const DAY_END_H = 26;
const SPAN_MIN = (DAY_END_H - DAY_START_H) * 60;
const pad = (n: number) => String(n).padStart(2, '0');
const SNAP_MS = 30 * 60_000; // drag moves and resizes in 30-minute steps

type DragMode = 'move' | 'resize';
interface Preview {
  id: number;
  roomId: number;
  start: Date;
  end: Date;
}

interface Props {
  lang: Lang;
  rooms: Room[];
  people: Person[];
  user: User;
  /** 'results': read-only board where a click on a session opens `onSessionOpen` (live results). */
  mode?: 'schedule' | 'results';
  onSessionOpen?: (s: Session) => void;
  /** Extra line on a card, e.g. GMV recorded so far. */
  badge?: (s: Session) => string | undefined;
  /** Called with the range on screen whenever it changes. */
  onRange?: (from: Date, to: Date) => void;
}

/** How a session is hit by leave: someone working it has approved (or pending) leave over it. */
export type LeaveHit = { status: 'approved' | 'pending'; personIds: number[] };

export function leaveHit(s: Session, leaves: BoardData['leaves']): LeaveHit | undefined {
  if (s.status === 'cancelled') return undefined;
  const hits = leaves.filter(
    (l) => s.staff.some((x) => x.personId === l.personId && !x.replaced) && new Date(l.start) < new Date(s.end) && new Date(l.end) > new Date(s.start),
  );
  if (hits.length === 0) return undefined;
  return { status: hits.some((l) => l.status === 'approved') ? 'approved' : 'pending', personIds: [...new Set(hits.map((l) => l.personId))] };
}

export function Board({ lang, rooms, people, user, mode = 'schedule', onSessionOpen, badge, onRange }: Props) {
  // Only the admin edits; MC and PD see the published schedule with their own sessions marked.
  const canEdit = isManager(user.role) && mode === 'schedule';
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayBkk());
  const [data, setData] = useState<BoardData>();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<FormTarget>();
  const [preview, setPreview] = useState<Preview>();
  const [savingId, setSavingId] = useState<number>();
  const showPanelOption = isManager(user.role) && mode === 'schedule';
  const [panelOn, setPanelOn] = useState(() => {
    try {
      return localStorage.getItem('summaryPanel') !== 'off';
    } catch {
      return true;
    }
  });
  const togglePanel = () =>
    setPanelOn((on) => {
      try {
        localStorage.setItem('summaryPanel', on ? 'off' : 'on');
      } catch {
        // storage blocked; the choice lasts until reload
      }
      return !on;
    });

  const days = useMemo(
    () => (view === 'day' ? [date] : view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i)) : monthGrid(date)),
    [view, date],
  );
  const from = bkkInstant(days[0], '00:00');
  const to = bkkInstant(days[days.length - 1], `${DAY_END_H}:00`);

  const load = useCallback(() => {
    setFailed(false);
    api.board(from, to).then(setData, () => setFailed(true));
  }, [from.getTime(), to.getTime()]);
  useEffect(load, [load]);
  useEffect(() => onRange?.(from, to), [from.getTime(), to.getTime()]);

  // After a save, offer to join the session with a back-to-back one that has the same people.
  async function afterSave(id?: number) {
    const fresh = await api.board(from, to).catch(() => undefined);
    if (!fresh) return load();
    setData(fresh);
    const me = fresh.sessions.find((x) => x.id === id);
    const other = me && fresh.sessions.find((x) => x.id !== me.id && mergeable(me, x));
    if (!me || !other) return;
    const span = (a: Session) => `${bkkTime(new Date(a.start))}–${bkkTime(new Date(a.end))}`;
    const merged = span({ ...me, start: me.start < other.start ? me.start : other.start, end: me.end > other.end ? me.end : other.end });
    const text = t(lang, 'mergeAsk').replace('{other}', span(other)).replace('{merged}', merged);
    if (window.confirm(text) && (await api.merge(me.id, other.id)).ok) load();
  }

  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const shown = rooms.filter((r) => r.isActive);
  const drafts = data?.sessions.filter((s) => s.status === 'draft').length ?? 0;

  async function publish() {
    if (!window.confirm(t(lang, 'publishConfirm'))) return;
    await api.publish(from, to);
    load();
  }

  const step = view === 'day' ? 1 : 7;
  const shift = (dir: 1 | -1) => setDate(view === 'month' ? addMonths(date, dir) : addDays(date, dir * step));
  const title =
    view === 'month'
      ? formatDay(date, lang, { month: 'long', year: 'numeric' })
      : view === 'day'
      ? formatDay(date, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : `${formatDay(days[0], lang, { day: 'numeric', month: 'short' })} – ${formatDay(days[6], lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const onDay = (day: string, x: { start: string; end: string }) =>
    new Date(x.start) < bkkInstant(addDays(day, 1), '00:00') && new Date(x.end) > bkkInstant(day, '00:00');
  const leavesOn = (day: string) => (data?.leaves ?? []).filter((l) => onDay(day, l));
  const holidayOn = (day: string) => (data?.holidays ?? []).find((h) => onDay(day, h));

  // Drag a session to move it (time and room); drag its right edge to change the end time.
  // A press without movement opens the form instead.
  function startDrag(e: ReactPointerEvent<HTMLElement>, s: Session, mode: DragMode) {
    if (!canEdit || e.button !== 0 || s.status === 'cancelled') return;
    e.preventDefault();
    e.stopPropagation();
    const lane = e.currentTarget.closest('.lane');
    if (!lane) return;
    const width = lane.getBoundingClientRect().width;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start0 = new Date(s.start).getTime();
    const end0 = new Date(s.end).getTime();
    let moved = false;
    let latest: Preview = { id: s.id, roomId: s.roomId, start: new Date(start0), end: new Date(end0) };

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const delta = Math.round(((ev.clientX - x0) / width) * SPAN_MIN * 60_000 / SNAP_MS) * SNAP_MS;
      if (mode === 'move') {
        const over = document
          .elementsFromPoint(ev.clientX, ev.clientY)
          .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.roomId !== undefined);
        const roomId = over ? Number(over.dataset.roomId) : latest.roomId;
        latest = { id: s.id, roomId, start: new Date(start0 + delta), end: new Date(end0 + delta) };
      } else {
        latest = { id: s.id, roomId: s.roomId, start: new Date(start0), end: new Date(Math.max(end0 + delta, start0 + SNAP_MS)) };
      }
      setPreview(latest);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) {
        setForm({ mode: 'edit', session: s });
        return;
      }
      // The browser still sends a click after the drag. If the pointer ended off the card (on a
      // stacked row, say) that click would land on the lane and open a new-session form.
      const swallow = (ev: MouseEvent) => ev.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      void commitDrag(s, latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function commitDrag(s: Session, to: Preview) {
    const unchanged = to.roomId === s.roomId && to.start.getTime() === new Date(s.start).getTime() && to.end.getTime() === new Date(s.end).getTime();
    if (unchanged) {
      setPreview(undefined);
      return;
    }
    // Show the session at its new place straight away; saving and reloading take a moment.
    const moved = { ...s, roomId: to.roomId, start: to.start.toISOString(), end: to.end.toISOString() };
    setData((d) => d && { ...d, sessions: d.sessions.map((x) => (x.id === s.id ? moved : x)) });
    setPreview(undefined);
    setSavingId(s.id);
    try {
      const input = { roomId: to.roomId, start: moved.start, end: moved.end, note: s.note, staff: s.staff };
      let res = await api.save(input, { id: s.id });
      const text = res.violations.map((v) => `• ${violationMessage(lang, v, nameOf, (id) => rooms.find((r) => r.id === id)?.code ?? `#${id}`)}`).join('\n');
      if (!res.ok && res.violations.every((v) => v.severity === 'warning')) {
        if (window.confirm(`${text}\n\n${t(lang, 'saveAnyway')}?`)) res = await api.save(input, { id: s.id, confirm: true });
      } else if (!res.ok) {
        window.alert(text);
      }
      // A refused move goes back to where it was.
      if (res.ok) await afterSave(s.id);
      else load();
    } catch {
      load();
    } finally {
      setSavingId(undefined);
    }
  }

  // Sessions as they should look right now, with the one being dragged at its new place.
  // Recording results only concerns sessions that are published (or cancelled, shown for the record).
  const visible = (data?.sessions ?? []).filter((x) => mode === 'schedule' || x.status !== 'draft');
  const leaves = data?.leaves ?? [];
  const cardExtras = (x: Session) => ({ hit: leaveHit(x, leaves), badge: badge?.(x) });
  const placed = visible.map((x) =>
    preview && x.id === preview.id
      ? { ...x, roomId: preview.roomId, start: preview.start.toISOString(), end: preview.end.toISOString() }
      : x,
  );

  return (
    <section className="board">
      <div className="toolbar">
        <div className="nav">
          <button aria-label="previous" onClick={() => shift(-1)}>‹</button>
          <strong>{title}</strong>
          <button aria-label="next" onClick={() => shift(1)}>›</button>
          <button onClick={() => setDate(todayBkk())}>{t(lang, 'today')}</button>
        </div>
        <div className="segmented" role="group">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
              {t(lang, v)}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="actions">
            <button className={`panel-toggle${panelOn ? ' on' : ''}`} aria-pressed={panelOn} onClick={togglePanel} title={t(lang, 'summaryPanel')}>
              <span className="switch" aria-hidden="true" />
              {t(lang, 'summaryPanel')}
            </button>
            {drafts > 0 && (
              <span className="badge">
                {drafts} {t(lang, 'draftCount')}
              </span>
            )}
            <button onClick={() => setAiOpen(true)}>{t(lang, 'aiButton')}</button>
            <button onClick={() => setBulkOpen(true)}>{t(lang, 'bulkButton')}</button>
            <button onClick={() => setForm({ mode: 'new', date, start: '10:00', end: '12:00' })}>{t(lang, 'addSession')}</button>
            <button className="primary" disabled={drafts === 0} onClick={publish}>
              {t(lang, 'publish')}
            </button>
          </div>
        )}
      </div>

      <div className={`board-body${showPanelOption && panelOn && view !== 'month' ? ' with-panel' : ''}`}>
        <div className="board-main">
      {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
      {!data && !failed && <p className="muted">{t(lang, 'loading')}</p>}

      {data && view === 'day' && (
        <>
          <DayNotes lang={lang} holiday={holidayOn(date)?.name} leaveNames={leavesOn(date).map((l) => nameOf(l.personId))} />
          <div className="day-grid">
            <div className="room-label" />
            <div className="hours">
              {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (
                <span key={i}>{pad((DAY_START_H + i) % 24)}:00</span>
              ))}
            </div>
            {shown.map((room) => (
              <DayRow
                key={room.id}
                lang={lang}
                room={room}
                date={date}
                sessions={placed.filter((s) => s.roomId === room.id)}
                draggingId={preview?.id}
                savingId={savingId}
                meId={user.id}
                canEdit={canEdit}
                nameOf={nameOf}
                extras={cardExtras}
                onOpen={onSessionOpen}
                onDragStart={startDrag}
                onEmpty={(hour) =>
                  canEdit &&
                  setForm({ mode: 'new', roomId: room.id, date, start: `${pad(hour % 24)}:00`, end: `${pad((hour + 2) % 24)}:00` })
                }
              />
            ))}
          </div>
        </>
      )}

      {data && view === 'month' && (
        <MonthView
          lang={lang}
          month={date.slice(0, 7)}
          days={days}
          rooms={shown}
          data={{ ...data, sessions: visible }}
          nameOf={nameOf}
          selected={date}
          onSelect={setDate}
          onOpenDay={(d) => (setDate(d), setView('day'))}
          showPanel={!showPanelOption || panelOn}
        />
      )}

      {data && view === 'week' && (
        <div className="week-wrap">
          <table className="week">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d} className={holidayOn(d) ? 'holiday' : ''}>
                    <button className="link" onClick={() => { setDate(d); setView('day'); }}>
                      {formatDay(d, lang, { weekday: 'short', day: 'numeric' })}
                    </button>
                    {holidayOn(d) && <small>{holidayOn(d)!.name}</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((room) => (
                <tr key={room.id}>
                  <th scope="row">{room.code}</th>
                  {days.map((d) => {
                    const list = visible.filter((s) => s.roomId === room.id && liveDate(new Date(s.start)) === d);
                    return (
                      <td key={d} onClick={() => canEdit && setForm({ mode: 'new', roomId: room.id, date: d, start: '10:00', end: '12:00' })}>
                        {list.map((s) => (
                          <SessionChip
                            key={s.id}
                            lang={lang}
                            session={s}
                            room={room}
                            meId={user.id}
                            nameOf={nameOf}
                            {...cardExtras(s)}
                            onOpen={canEdit ? () => setForm({ mode: 'edit', session: s }) : onSessionOpen && s.status !== 'cancelled' ? () => onSessionOpen(s) : undefined}
                          />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && view !== 'month' && (
        <div className="legend">
          <span><i />{t(lang, 'legendNormal')}</span>
          <span><i className="mine" />{t(lang, 'legendMine')}</span>
          {mode === 'schedule' && <span><i className="draft" />{t(lang, 'draft')}</span>}
          <span><i className="incomplete" />{t(lang, 'noPd')}</span>
          <span><i className="leave-approved" />{t(lang, 'needsCover')}</span>
          <span><i className="leave-pending" />{t(lang, 'leavePendingOn')}</span>
        </div>
      )}

        </div>
        {showPanelOption && panelOn && data && view !== 'month' && (
          <SummaryPanel lang={lang} date={date} days={days} sessions={visible} leaves={leaves} rooms={rooms} nameOf={nameOf} />
        )}
      </div>

      {form && (
        <SessionForm
          lang={lang}
          rooms={rooms}
          people={people}
          target={form}
          onClose={() => setForm(undefined)}
          onSaved={(id) => {
            setForm(undefined);
            void afterSave(id);
          }}
        />
      )}
      {aiOpen && (
        <AutoSchedule
          lang={lang}
          date={date}
          rooms={rooms}
          people={people}
          onClose={() => setAiOpen(false)}
          onDone={(first) => {
            setAiOpen(false);
            if (first) {
              setDate(first);
              setView('week');
            }
            load();
          }}
        />
      )}
      {bulkOpen && (
        <BulkTools
          lang={lang}
          date={date}
          rooms={rooms}
          people={people}
          onClose={() => setBulkOpen(false)}
          onDone={(first) => {
            setBulkOpen(false);
            // Show where the new drafts landed.
            if (first) {
              setDate(first);
              setView('week');
            }
            load();
          }}
        />
      )}
    </section>
  );
}

/** Admin's side panel: what needs handling for the days on screen, who is on leave, hours vs cap this month. */
function SummaryPanel({
  lang,
  date,
  days,
  sessions,
  leaves,
  rooms,
  nameOf,
}: {
  lang: Lang;
  date: string;
  days: string[];
  sessions: Session[];
  leaves: BoardData['leaves'];
  rooms: Room[];
  nameOf: (id: number) => string;
}) {
  const [pending, setPending] = useState<number>();
  const [hours, setHours] = useState<HoursRow[]>();
  const month = date.slice(0, 7);
  useEffect(() => {
    void Promise.all([api.leave({ status: 'pending' }), api.swaps({ status: 'pending' })]).then(([l, s]) => setPending(l.length + s.length), () => undefined);
  }, [leaves]);
  useEffect(() => {
    void api.hours(month).then(setHours, () => setHours([]));
  }, [month, sessions]);

  const live = sessions.filter((s) => s.status !== 'cancelled');
  const needCover = live.filter((s) => leaveHit(s, leaves)?.status === 'approved').length;
  const noPd = live.filter((s) => {
    const room = rooms.find((r) => r.id === s.roomId);
    return room?.roomType === 'live' && room.requiresPd && !s.staff.some((x) => x.role === 'pd' && !x.replaced);
  }).length;
  const drafts = sessions.filter((s) => s.status === 'draft').length;
  const from = bkkInstant(days[0], '00:00');
  const to = bkkInstant(addDays(days[days.length - 1], 1), '00:00');
  const onLeave = leaves.filter((l) => new Date(l.start) < to && new Date(l.end) > from);
  const team = (hours ?? []).filter((h) => h.employment === 'full_time' && h.maxHours !== null);
  const scope =
    days.length === 1
      ? date === todayBkk()
        ? t(lang, 'today')
        : formatDay(date, lang, { day: 'numeric', month: 'short' })
      : `${formatDay(days[0], lang, { day: 'numeric', month: 'short' })} – ${formatDay(days[days.length - 1], lang, { day: 'numeric', month: 'short' })}`;

  return (
    <aside className="summary-panel">
      <section className="sp-card gray">
        <h3>
          {t(lang, 'toHandle')} · {scope}
        </h3>
        <dl>
          <div className={needCover ? 'hot' : ''}>
            <dt>{t(lang, 'needsCover')}</dt>
            <dd>{needCover}</dd>
          </div>
          <div className={noPd ? 'hot' : ''}>
            <dt>{t(lang, 'sessionsNoPd')}</dt>
            <dd>{noPd}</dd>
          </div>
          <div>
            <dt>{t(lang, 'draftCount')}</dt>
            <dd>{drafts}</dd>
          </div>
          <div className={pending ? 'hot' : ''}>
            <dt>{t(lang, 'pendingRequests')}</dt>
            <dd>{pending ?? '…'}</dd>
          </div>
        </dl>
      </section>

      <section className="sp-card">
        <h3>
          {t(lang, 'whoOnLeave')} · {scope}
        </h3>
        {onLeave.length === 0 ? (
          <p className="muted">{t(lang, 'nobodyOnLeave')}</p>
        ) : (
          <ul>
            {onLeave.map((l, i) => (
              <li key={i}>
                {nameOf(l.personId)} · {t(lang, l.kind === 'urgent' ? 'leaveUrgent' : 'leaveNormal')}
                {days.length > 1 && ` · ${formatDay(bkkDate(new Date(l.start)), lang, { weekday: 'short', day: 'numeric' })}`}{' '}
                <span className={`pill status-${l.status}`}>{t(lang, l.status === 'approved' ? 'statusApproved' : 'statusPending')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sp-card">
        <h3>{t(lang, 'hoursThisMonth')}</h3>
        <p className="hint">{t(lang, 'hoursVsCap')}</p>
        {hours === undefined && <p className="muted">{t(lang, 'loading')}</p>}
        <ul className="sp-hours">
          {team.map((h) => {
            const near = h.totalHours >= h.maxHours! - 8;
            return (
              <li key={h.personId} className={near ? 'near' : ''}>
                <div>
                  <span>{h.nickname}</span>
                  <span>
                    {h.totalHours} / {h.maxHours}
                  </span>
                </div>
                <div className="kpi-bar">
                  <span style={{ width: `${Math.min(100, (h.totalHours / h.maxHours!) * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="hint">{t(lang, 'nearCapNote')}</p>
      </section>
    </aside>
  );
}

/** Same rule as the API's canMerge: same room and status, back to back, same people in the same roles. */
function mergeable(a: Session, b: Session): boolean {
  const key = (x: Session) =>
    x.staff
      .filter((st) => !st.replaced)
      .map((st) => `${st.personId}:${st.role}`)
      .sort()
      .join(',');
  const touching = a.end === b.start || b.end === a.start;
  return a.roomId === b.roomId && a.status === b.status && a.status !== 'cancelled' && touching && key(a) !== '' && key(a) === key(b);
}

function DayNotes({ lang, holiday, leaveNames }: { lang: Lang; holiday?: string; leaveNames: string[] }) {
  if (!holiday && leaveNames.length === 0) return null;
  return (
    <p className="day-notes">
      {holiday && <span className="pill holiday">{t(lang, 'holidayLabel')}: {holiday}</span>}
      {leaveNames.length > 0 && <span className="pill">{t(lang, 'onLeave')}: {leaveNames.join(', ')}</span>}
    </p>
  );
}

interface RowProps {
  lang: Lang;
  room: Room;
  date: string;
  sessions: Session[];
  nameOf: (id: number) => string;
  draggingId?: number;
  savingId?: number;
  meId: number;
  canEdit: boolean;
  extras: (s: Session) => { hit?: LeaveHit; badge?: string };
  onOpen?: (s: Session) => void;
  onDragStart: (e: ReactPointerEvent<HTMLElement>, s: Session, mode: DragMode) => void;
  onEmpty: (hour: number) => void;
}

const ROW_H = 64; // height of one stacked row of cards in a lane, in px

/**
 * Puts overlapping sessions on separate rows so none hides another, e.g. a cancelled session
 * and the replacement booked in its slot. The card being dragged keeps the top row, live
 * sessions come next and cancelled ones fill in below.
 */
function stackRows(sessions: Session[], draggingId?: number): { rowOf: Map<number, number>; rows: number } {
  const rank = (x: Session) => (x.id === draggingId ? 0 : x.status === 'cancelled' ? 2 : 1);
  const order = [...sessions].sort((a, b) => rank(a) - rank(b) || Date.parse(a.start) - Date.parse(b.start));
  const taken: { start: number; end: number }[][] = [];
  const rowOf = new Map<number, number>();
  for (const x of order) {
    const span = { start: Date.parse(x.start), end: Date.parse(x.end) };
    let row = taken.findIndex((spans) => spans.every((o) => o.end <= span.start || o.start >= span.end));
    if (row === -1) row = taken.push([]) - 1;
    taken[row].push(span);
    rowOf.set(x.id, row);
  }
  return { rowOf, rows: Math.max(taken.length, 1) };
}

function DayRow({ lang, room, date, sessions, draggingId, savingId, meId, canEdit, nameOf, extras, onOpen, onDragStart, onEmpty }: RowProps) {
  const { rowOf, rows } = stackRows(sessions, draggingId);
  return (
    <>
      <div className="room-label">
        <strong>{room.code}</strong>
        {room.roomType === 'content' && <small>content</small>}
      </div>
      <div
        className="lane"
        data-room-id={room.id}
        style={{ minHeight: rows * ROW_H + 8 }}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const hour = DAY_START_H + Math.floor(((e.clientX - box.left) / box.width) * (DAY_END_H - DAY_START_H));
          onEmpty(hour);
        }}
      >
        {sessions.map((s) => {
          const startMin = Math.max(minutesFrom(date, new Date(s.start)) - DAY_START_H * 60, 0);
          const endMin = Math.min(minutesFrom(date, new Date(s.end)) - DAY_START_H * 60, SPAN_MIN);
          if (endMin <= 0 || startMin >= SPAN_MIN) return null;
          return (
            <div
              key={s.id}
              className={`block-pos${s.id === draggingId ? ' dragging' : ''}${s.id === savingId ? ' saving' : ''}${s.status === 'cancelled' ? ' cancelled' : canEdit ? ' draggable' : onOpen ? ' openable' : ''}`}
              style={{
                left: `${(startMin / SPAN_MIN) * 100}%`,
                width: `${((endMin - startMin) / SPAN_MIN) * 100}%`,
                top: 4 + (rowOf.get(s.id) ?? 0) * ROW_H,
                height: ROW_H - 4,
              }}
              onPointerDown={(e) => onDragStart(e, s, 'move')}
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit && onOpen && s.status !== 'cancelled') onOpen(s);
              }}
            >
              <SessionChip lang={lang} session={s} room={room} meId={meId} nameOf={nameOf} {...extras(s)} />
              {canEdit && s.status !== 'cancelled' && (
                <span className="resize" aria-hidden="true" onPointerDown={(e) => onDragStart(e, s, 'resize')} />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

interface ChipProps {
  lang: Lang;
  session: Session;
  room: Room;
  meId: number;
  nameOf: (id: number) => string;
  onOpen?: () => void; // day view opens through the drag handler instead
  hit?: LeaveHit;
  badge?: string;
}

function SessionChip({ lang, session: s, room, meId, nameOf, onOpen, hit, badge }: ChipProps) {
  const working = s.staff.filter((x) => !x.replaced);
  const missingPd = room.roomType === 'live' && room.requiresPd && !working.some((x) => x.role === 'pd');
  const names = working.map((x) => nameOf(x.personId)).join(' · ');
  const mine = working.some((x) => x.personId === meId);
  const cls = ['chip', s.status, missingPd && s.status !== 'cancelled' ? 'incomplete' : '', mine ? 'mine' : '', hit ? `leave-${hit.status}` : '', badge ? 'has-badge' : ''].join(' ');
  const onLeave = hit?.personIds.map(nameOf).join(', ');
  return (
    <button
      className={cls}
      title={[onLeave && `${t(lang, hit!.status === 'approved' ? 'needsCover' : 'leavePendingOn')}: ${onLeave}`, s.note].filter(Boolean).join('\n') || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
    >
      <span className="who">{names || '—'}</span>
      <span className="when">
        {bkkTime(new Date(s.start))}–{bkkTime(new Date(s.end))}
        {s.status === 'draft' && ` · ${t(lang, 'draft')}`}
        {s.status === 'cancelled' && ` · ${t(lang, 'cancelled')}`}
        {missingPd && s.status !== 'cancelled' && ` · ${t(lang, 'noPd')}`}
      </span>
      {hit && (
        <span className="leave-flag">
          {t(lang, hit.status === 'approved' ? 'needsCover' : 'leavePendingOn')}: {onLeave}
        </span>
      )}
      {badge && <span className="badge-line">{badge}</span>}
    </button>
  );
}
