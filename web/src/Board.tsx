import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api, type Board as BoardData, type Person, type Room, type Session } from './api';
import { t, violationMessage, type Lang } from './i18n';
import { SessionForm, type FormTarget } from './SessionForm';
import { addDays, bkkDate, bkkInstant, bkkTime, formatDay, minutesFrom, mondayOf, todayBkk } from './time';

type View = 'day' | 'week';

// Day view spans 08:00 to 02:00 the next morning; late lives run past midnight.
const DAY_START_H = 8;
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
}

export function Board({ lang, rooms, people }: Props) {
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayBkk());
  const [data, setData] = useState<BoardData>();
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<FormTarget>();
  const [preview, setPreview] = useState<Preview>();

  const days = useMemo(
    () => (view === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i))),
    [view, date],
  );
  const from = bkkInstant(days[0], '00:00');
  const to = bkkInstant(days[days.length - 1], `${DAY_END_H}:00`);

  const load = useCallback(() => {
    setFailed(false);
    api.board(from, to).then(setData, () => setFailed(true));
  }, [from.getTime(), to.getTime()]);
  useEffect(load, [load]);

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
  const title =
    view === 'day'
      ? formatDay(date, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : `${formatDay(days[0], lang, { day: 'numeric', month: 'short' })} – ${formatDay(days[6], lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const onDay = (day: string, x: { start: string; end: string }) =>
    new Date(x.start) < bkkInstant(addDays(day, 1), '00:00') && new Date(x.end) > bkkInstant(day, '00:00');
  const leavesOn = (day: string) => (data?.leaves ?? []).filter((l) => onDay(day, l));
  const holidayOn = (day: string) => (data?.holidays ?? []).find((h) => onDay(day, h));

  // Drag a session to move it (time and room); drag its right edge to change the end time.
  // A press without movement opens the form instead.
  function startDrag(e: ReactPointerEvent<HTMLElement>, s: Session, mode: DragMode) {
    if (e.button !== 0 || s.status === 'cancelled') return;
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
      void commitDrag(s, latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function commitDrag(s: Session, to: Preview) {
    const unchanged = to.roomId === s.roomId && to.start.getTime() === new Date(s.start).getTime() && to.end.getTime() === new Date(s.end).getTime();
    let savedId: number | undefined;
    if (!unchanged) {
      const input = {
        roomId: to.roomId,
        start: to.start.toISOString(),
        end: to.end.toISOString(),
        note: s.note,
        staff: s.staff,
      };
      let res = await api.save(input, { id: s.id });
      const text = res.violations.map((v) => `• ${violationMessage(lang, v, nameOf, (id) => rooms.find((r) => r.id === id)?.code ?? `#${id}`)}`).join('\n');
      if (!res.ok && res.violations.every((v) => v.severity === 'warning')) {
        if (window.confirm(`${text}\n\n${t(lang, 'saveAnyway')}?`)) res = await api.save(input, { id: s.id, confirm: true });
      } else if (!res.ok) {
        window.alert(text);
      }
      if (res.ok) savedId = s.id;
    }
    setPreview(undefined);
    await afterSave(savedId);
  }

  // Sessions as they should look right now, with the one being dragged at its new place.
  const placed = (data?.sessions ?? []).map((x) =>
    preview && x.id === preview.id
      ? { ...x, roomId: preview.roomId, start: preview.start.toISOString(), end: preview.end.toISOString() }
      : x,
  );

  return (
    <section className="board">
      <div className="toolbar">
        <div className="nav">
          <button aria-label="previous" onClick={() => setDate(addDays(date, -step))}>‹</button>
          <strong>{title}</strong>
          <button aria-label="next" onClick={() => setDate(addDays(date, step))}>›</button>
          <button onClick={() => setDate(todayBkk())}>{t(lang, 'today')}</button>
        </div>
        <div className="segmented" role="group">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
              {t(lang, v)}
            </button>
          ))}
        </div>
        <div className="actions">
          {drafts > 0 && (
            <span className="badge">
              {drafts} {t(lang, 'draftCount')}
            </span>
          )}
          <button onClick={() => setForm({ mode: 'new', date, start: '10:00', end: '12:00' })}>{t(lang, 'addSession')}</button>
          <button className="primary" disabled={drafts === 0} onClick={publish}>
            {t(lang, 'publish')}
          </button>
        </div>
      </div>

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
                nameOf={nameOf}
                onDragStart={startDrag}
                onEmpty={(hour) =>
                  setForm({ mode: 'new', roomId: room.id, date, start: `${pad(hour % 24)}:00`, end: `${pad((hour + 2) % 24)}:00` })
                }
              />
            ))}
          </div>
        </>
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
                    const list = data.sessions.filter((s) => s.roomId === room.id && bkkDate(new Date(s.start)) === d);
                    return (
                      <td key={d} onClick={() => setForm({ mode: 'new', roomId: room.id, date: d, start: '10:00', end: '12:00' })}>
                        {list.map((s) => (
                          <SessionChip key={s.id} lang={lang} session={s} room={room} nameOf={nameOf} onOpen={() => setForm({ mode: 'edit', session: s })} />
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
    </section>
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
  onDragStart: (e: ReactPointerEvent<HTMLElement>, s: Session, mode: DragMode) => void;
  onEmpty: (hour: number) => void;
}

function DayRow({ lang, room, date, sessions, draggingId, nameOf, onDragStart, onEmpty }: RowProps) {
  return (
    <>
      <div className="room-label">
        <strong>{room.code}</strong>
        {room.roomType === 'content' && <small>content</small>}
      </div>
      <div
        className="lane"
        data-room-id={room.id}
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
              className={`block-pos${s.id === draggingId ? ' dragging' : ''}${s.status === 'cancelled' ? '' : ' draggable'}`}
              style={{ left: `${(startMin / SPAN_MIN) * 100}%`, width: `${((endMin - startMin) / SPAN_MIN) * 100}%` }}
              onPointerDown={(e) => onDragStart(e, s, 'move')}
              onClick={(e) => e.stopPropagation()}
            >
              <SessionChip lang={lang} session={s} room={room} nameOf={nameOf} />
              {s.status !== 'cancelled' && (
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
  nameOf: (id: number) => string;
  onOpen?: () => void; // day view opens through the drag handler instead
}

function SessionChip({ lang, session: s, room, nameOf, onOpen }: ChipProps) {
  const working = s.staff.filter((x) => !x.replaced);
  const missingPd = room.roomType === 'live' && room.requiresPd && !working.some((x) => x.role === 'pd');
  const names = working.map((x) => nameOf(x.personId)).join(' · ');
  const cls = ['chip', s.status, missingPd && s.status !== 'cancelled' ? 'incomplete' : ''].join(' ');
  return (
    <button
      className={cls}
      title={s.note ?? undefined}
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
    </button>
  );
}
