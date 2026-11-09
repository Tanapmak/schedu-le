import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api, canPlanShoots, type Board as BoardData, type Person, type Room, type Session, type Shoot, type ShootInput, type User } from './api';
import { t, violationMessage, type Lang, type ViolationLike } from './i18n';
import { addDays, bkkDate, bkkInstant, bkkTime, formatDay, liveDate, liveInstant, minutesFrom, mondayOf, todayBkk } from './time';
import { useBackdropClose } from './ui';

// Same time axis as the live schedule: 06:00 to 02:00 the next morning.
const DAY_START_H = 6;
const DAY_END_H = 26;
const SPAN_MIN = (DAY_END_H - DAY_START_H) * 60;
const SNAP_MS = 30 * 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

type View = 'day' | 'week';
type DragMode = 'move' | 'resize';
interface Preview {
  id: number;
  fromPerson: number;
  toPerson: number;
  start: Date;
  end: Date;
}
type FormTarget = { mode: 'new'; personId?: number; date: string; start: string; end: string } | { mode: 'edit'; shoot: Shoot };

interface Props {
  lang: Lang;
  rooms: Room[];
  people: Person[];
  user: User;
}

const overlaps = (a: { start: string | Date; end: string | Date }, b: { start: string | Date; end: string | Date }) =>
  new Date(a.start) < new Date(b.end) && new Date(a.end) > new Date(b.start);

/** Lives (not cancelled) each person works, from the board data. */
function livesOf(sessions: Session[], personId: number) {
  return sessions.filter((s) => s.status !== 'cancelled' && s.staff.some((x) => x.personId === personId && !x.replaced));
}

/** The shoot's people with one moved to another lane (no duplicates). */
function swapPerson(ids: number[], from: number, to: number) {
  return [...new Set(ids.map((id) => (id === from ? to : id)))];
}

export function ContentShootsPage({ lang, rooms, people, user }: Props) {
  const canEdit = canPlanShoots(user.role);
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayBkk());
  const [board, setBoard] = useState<BoardData>();
  const [shoots, setShoots] = useState<Shoot[]>();
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<FormTarget>();
  const [preview, setPreview] = useState<Preview>();
  const [savingId, setSavingId] = useState<number>();

  const days = useMemo(() => (view === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i))), [view, date]);
  const from = bkkInstant(days[0], '00:00');
  const to = bkkInstant(days[days.length - 1], `${DAY_END_H}:00`);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([api.board(from, to), api.shoots(from, to)]).then(
      ([b, s]) => (setBoard(b), setShoots(s)),
      () => setFailed(true),
    );
  }, [from.getTime(), to.getTime()]);
  useEffect(load, [load]);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  const sessions = board?.sessions ?? [];
  const list = shoots ?? [];

  // Lanes: every active MC and PD, plus anyone else already booked in a shoot on screen.
  const lanes = useMemo(() => {
    const inShoots = new Set(list.flatMap((s) => s.personIds));
    const rank = (p: Person) => (p.position === 'mc' ? 0 : p.position === 'pd' ? 1 : 2);
    return people
      .filter((p) => (p.isActive && (p.position === 'mc' || p.position === 'pd')) || inShoots.has(p.id))
      .sort((a, b) => rank(a) - rank(b) || a.nickname.localeCompare(b.nickname));
  }, [people, list]);

  /** Lives that a shoot (at its time, with these people) runs into. */
  const clashes = (personIds: number[], start: string | Date, end: string | Date) =>
    personIds.flatMap((pid) => livesOf(sessions, pid).filter((l) => overlaps(l, { start, end })).map((l) => ({ personId: pid, live: l })));

  const step = view === 'day' ? 1 : 7;
  const title =
    view === 'day'
      ? formatDay(date, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : `${formatDay(days[0], lang, { day: 'numeric', month: 'short' })} – ${formatDay(days[6], lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const holidayOn = (day: string) =>
    (board?.holidays ?? []).find((h) => new Date(h.start) < bkkInstant(addDays(day, 1), '00:00') && new Date(h.end) > bkkInstant(day, '00:00'));

  // Drag a shoot sideways to change its time, up/down to give it to someone else; drag the right edge to resize.
  function startDrag(e: ReactPointerEvent<HTMLElement>, s: Shoot, personId: number, mode: DragMode) {
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const lane = e.currentTarget.closest('.lane');
    if (!lane) return;
    const width = lane.getBoundingClientRect().width;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start0 = Date.parse(s.start);
    const end0 = Date.parse(s.end);
    let moved = false;
    let latest: Preview = { id: s.id, fromPerson: personId, toPerson: personId, start: new Date(start0), end: new Date(end0) };

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const delta = Math.round((((ev.clientX - x0) / width) * SPAN_MIN * 60_000) / SNAP_MS) * SNAP_MS;
      if (mode === 'move') {
        const over = document
          .elementsFromPoint(ev.clientX, ev.clientY)
          .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.personId !== undefined);
        const toPerson = over ? Number(over.dataset.personId) : latest.toPerson;
        latest = { ...latest, toPerson, start: new Date(start0 + delta), end: new Date(end0 + delta) };
      } else {
        latest = { ...latest, end: new Date(Math.max(end0 + delta, start0 + SNAP_MS)) };
      }
      setPreview(latest);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) {
        setForm({ mode: 'edit', shoot: s });
        return;
      }
      // Swallow the click the browser sends after a drag, so it doesn't open a new-shoot form.
      const swallow = (ev: MouseEvent) => ev.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      void commitDrag(s, latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function commitDrag(s: Shoot, p: Preview) {
    const personIds = swapPerson(s.personIds, p.fromPerson, p.toPerson);
    const unchanged = p.fromPerson === p.toPerson && p.start.getTime() === Date.parse(s.start) && p.end.getTime() === Date.parse(s.end);
    setPreview(undefined);
    if (unchanged) return;
    const moved: Shoot = { ...s, personIds, start: p.start.toISOString(), end: p.end.toISOString() };
    setShoots((list) => list?.map((x) => (x.id === s.id ? moved : x)));
    setSavingId(s.id);
    try {
      const input: ShootInput = { title: s.title, location: s.location, note: s.note, personIds, start: moved.start, end: moved.end };
      let res = await api.saveShoot(input, { id: s.id });
      const text = res.violations.map((v) => `• ${violationMessage(lang, v, nameOf, codeOf)}`).join('\n');
      if (!res.ok && res.violations.every((v) => v.severity === 'warning')) {
        if (window.confirm(`${text}\n\n${t(lang, 'saveAnyway')}?`)) res = await api.saveShoot(input, { id: s.id, confirm: true });
      } else if (!res.ok) {
        window.alert(text);
      }
    } finally {
      setSavingId(undefined);
      load(); // a refused move goes back where it was
    }
  }

  // The shoots as they should look right now, with the one being dragged at its new place.
  const placed = list.map((s) =>
    preview && s.id === preview.id
      ? { ...s, start: preview.start.toISOString(), end: preview.end.toISOString(), personIds: swapPerson(s.personIds, preview.fromPerson, preview.toPerson) }
      : s,
  );

  return (
    <section className="board shoots-page">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'shootsNav')}</h1>
          {canEdit && <p className="sub">{t(lang, 'shootsSub')}</p>}
        </div>
      </div>
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
        {canEdit && (
          <div className="actions">
            <button className="primary" onClick={() => setForm({ mode: 'new', date, start: '10:00', end: '12:00' })}>
              {t(lang, 'addShoot')}
            </button>
          </div>
        )}
      </div>

      {failed && <p className="error">{t(lang, 'loadFailed')}</p>}
      {(!board || !shoots) && !failed && <p className="muted">{t(lang, 'loading')}</p>}
      {board && shoots && lanes.length === 0 && <p className="muted">{t(lang, 'noShootPeople')}</p>}

      {board && shoots && view === 'day' && (
        <>
          {holidayOn(date) && (
            <p className="day-notes">
              <span className="pill holiday">
                {t(lang, 'holidayLabel')}: {holidayOn(date)!.name}
              </span>
            </p>
          )}
          <div className="day-grid">
            <div className="room-label" />
            <div className="hours">
              {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (
                <span key={i}>{pad((DAY_START_H + i) % 24)}:00</span>
              ))}
            </div>
            {lanes.map((p) => (
              <PersonLane
                key={p.id}
                lang={lang}
                person={p}
                date={date}
                lives={livesOf(sessions, p.id)}
                shoots={placed.filter((s) => s.personIds.includes(p.id))}
                clashes={clashes}
                codeOf={codeOf}
                nameOf={nameOf}
                canEdit={canEdit}
                draggingId={preview?.id}
                savingId={savingId}
                onDragStart={startDrag}
                onEmpty={(hour) =>
                  canEdit && setForm({ mode: 'new', personId: p.id, date, start: `${pad(hour % 24)}:00`, end: `${pad((hour + 2) % 24)}:00` })
                }
              />
            ))}
          </div>
        </>
      )}

      {board && shoots && view === 'week' && (
        <div className="week-wrap">
          <table className="week shoots-week">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d} className={holidayOn(d) ? 'holiday' : ''}>
                    <button className="link" onClick={() => (setDate(d), setView('day'))}>
                      {formatDay(d, lang, { weekday: 'short', day: 'numeric' })}
                    </button>
                    {holidayOn(d) && <small>{holidayOn(d)!.name}</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lanes.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    {p.nickname} <small className="muted">{p.position.toUpperCase()}</small>
                  </th>
                  {days.map((d) => {
                    const lives = livesOf(sessions, p.id).filter((l) => liveDate(new Date(l.start)) === d);
                    const mine = list.filter((s) => s.personIds.includes(p.id) && liveDate(new Date(s.start)) === d);
                    return (
                      <td key={d} onClick={() => canEdit && setForm({ mode: 'new', personId: p.id, date: d, start: '10:00', end: '12:00' })}>
                        {lives.map((l) => (
                          <span key={`l${l.id}`} className="live-mini">
                            {t(lang, 'liveBar')} {codeOf(l.roomId)} {bkkTime(new Date(l.start))}–{bkkTime(new Date(l.end))}
                          </span>
                        ))}
                        {mine.map((s) => (
                          <ShootChip
                            key={s.id}
                            lang={lang}
                            shoot={s}
                            clash={clashes(s.personIds, s.start, s.end).length > 0}
                            onOpen={() => setForm({ mode: 'edit', shoot: s })}
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

      {board && shoots && (
        <div className="legend">
          <span><i className="shoot" />{t(lang, 'legendShoot')}</span>
          <span><i className="live-bg" />{t(lang, 'legendLive')}</span>
          <span><i className="shoot clash" />{t(lang, 'legendClash')}</span>
        </div>
      )}

      {form && (
        <ShootForm
          lang={lang}
          people={people}
          lanes={lanes}
          rooms={rooms}
          target={form}
          canEdit={canEdit}
          onClose={() => setForm(undefined)}
          onSaved={() => (setForm(undefined), load())}
        />
      )}
    </section>
  );
}

interface LaneProps {
  lang: Lang;
  person: Person;
  date: string;
  lives: Session[];
  shoots: Shoot[];
  clashes: (personIds: number[], start: string, end: string) => { personId: number; live: Session }[];
  codeOf: (id: number) => string;
  nameOf: (id: number) => string;
  canEdit: boolean;
  draggingId?: number;
  savingId?: number;
  onDragStart: (e: ReactPointerEvent<HTMLElement>, s: Shoot, personId: number, mode: DragMode) => void;
  onEmpty: (hour: number) => void;
}

/** Where an interval sits on the day's axis, in % of the lane; undefined when off screen. */
function placeOn(date: string, start: string, end: string) {
  const a = Math.max(minutesFrom(date, new Date(start)) - DAY_START_H * 60, 0);
  const b = Math.min(minutesFrom(date, new Date(end)) - DAY_START_H * 60, SPAN_MIN);
  if (b <= 0 || a >= SPAN_MIN) return undefined;
  return { left: `${(a / SPAN_MIN) * 100}%`, width: `${((b - a) / SPAN_MIN) * 100}%` };
}

function PersonLane({ lang, person, date, lives, shoots, clashes, codeOf, nameOf, canEdit, draggingId, savingId, onDragStart, onEmpty }: LaneProps) {
  return (
    <>
      <div className="room-label">
        <strong>{person.nickname}</strong>
        <small>{person.position.toUpperCase()}</small>
      </div>
      <div
        className={`lane person-lane${canEdit ? '' : ' read-only'}`}
        data-person-id={person.id}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          onEmpty(DAY_START_H + Math.floor(((e.clientX - box.left) / box.width) * (DAY_END_H - DAY_START_H)));
        }}
      >
        {lives.map((l) => {
          const pos = placeOn(date, l.start, l.end);
          if (!pos) return null;
          return (
            <div key={`l${l.id}`} className={`live-bg${l.status === 'draft' ? ' draft' : ''}`} style={pos} title={`${t(lang, 'liveBar')} ${codeOf(l.roomId)}`}>
              <span>
                {t(lang, 'liveBar')} {codeOf(l.roomId)} · {bkkTime(new Date(l.start))}–{bkkTime(new Date(l.end))}
              </span>
            </div>
          );
        })}
        {shoots.map((s) => {
          const pos = placeOn(date, s.start, s.end);
          if (!pos) return null;
          const hit = clashes(s.personIds, s.start, s.end);
          const others = s.personIds.filter((id) => id !== person.id).map(nameOf);
          return (
            <div
              key={s.id}
              className={`block-pos shoot-pos${s.id === draggingId ? ' dragging' : ''}${s.id === savingId ? ' saving' : ''}${canEdit ? ' draggable' : ' openable'}`}
              style={{ ...pos, top: 4, height: 52 }}
              onPointerDown={(e) => onDragStart(e, s, person.id, 'move')}
              onClick={(e) => e.stopPropagation()}
            >
              <ShootChip lang={lang} shoot={s} clash={hit.length > 0} others={others} />
              {canEdit && <span className="resize" aria-hidden="true" onPointerDown={(e) => onDragStart(e, s, person.id, 'resize')} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ShootChip({ lang, shoot: s, clash, others, onOpen }: { lang: Lang; shoot: Shoot; clash: boolean; others?: string[]; onOpen?: () => void }) {
  return (
    <button
      className={`chip shoot${clash ? ' clash' : ''}`}
      title={[s.title, s.location, s.note].filter(Boolean).join('\n')}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
    >
      <span className="who">{s.title}</span>
      <span className="when">
        {bkkTime(new Date(s.start))}–{bkkTime(new Date(s.end))}
        {s.location && ` · ${s.location}`}
        {others && others.length > 0 && ` · +${others.join(', ')}`}
      </span>
      {clash && <span className="leave-flag">{t(lang, 'shootClashFlag')}</span>}
    </button>
  );
}

interface FormProps {
  lang: Lang;
  people: Person[];
  lanes: Person[];
  rooms: Room[];
  target: FormTarget;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ShootForm({ lang, people, lanes, rooms, target, canEdit, onClose, onSaved }: FormProps) {
  const editing = target.mode === 'edit' ? target.shoot : undefined;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(editing ? liveDate(new Date(editing.start)) : target.mode === 'new' ? target.date : todayBkk());
  const [start, setStart] = useState(editing ? bkkTime(new Date(editing.start)) : target.mode === 'new' ? target.start : '10:00');
  const [end, setEnd] = useState(editing ? bkkTime(new Date(editing.end)) : target.mode === 'new' ? target.end : '12:00');
  const [personIds, setPersonIds] = useState<number[]>(editing?.personIds ?? (target.mode === 'new' && target.personId ? [target.personId] : []));
  const [location, setLocation] = useState(editing?.location ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [violations, setViolations] = useState<ViolationLike[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  // Everyone on the board, plus anyone already in this shoot.
  const choices = [...lanes, ...people.filter((p) => personIds.includes(p.id) && !lanes.some((l) => l.id === p.id))];

  const input = useMemo((): ShootInput | undefined => {
    if (!date || !start || !end) return undefined;
    const s = liveInstant(date, start);
    let e = liveInstant(date, end);
    if (e <= s) e = new Date(e.getTime() + 86_400_000);
    return { title: title.trim(), start: s.toISOString(), end: e.toISOString(), personIds, location: location.trim() || null, note: note.trim() || null };
  }, [title, date, start, end, personIds, location, note]);

  // Check as the planner types, so a clash with a live shows before saving.
  useEffect(() => {
    setNeedsConfirm(false);
    if (!input || !canEdit || !input.title) return;
    const timer = setTimeout(() => {
      api.checkShoot({ ...input, id: editing?.id }).then(setViolations, () => setViolations([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [input, editing?.id, canEdit]);

  const errors = violations.filter((v) => v.severity === 'error');
  const blockedIds = new Set(violations.filter((v) => v.code === 'shoot_live_clash' || v.code === 'shoot_on_leave' || v.code === 'shoot_overlap').map((v) => v.personId));
  const toggle = (id: number) => setPersonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function save() {
    if (!input) return;
    setBusy(true);
    try {
      const res = await api.saveShoot(input, { id: editing?.id, confirm: needsConfirm });
      if (res.ok) return onSaved();
      setViolations(res.violations);
      setNeedsConfirm(res.violations.every((v) => v.severity === 'warning'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !window.confirm(t(lang, 'deleteShootConfirm'))) return;
    setBusy(true);
    try {
      if ((await api.deleteShoot(editing.id)).ok) onSaved();
    } finally {
      setBusy(false);
    }
  }

  const backdrop = useBackdropClose(onClose);
  return (
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal" role="dialog" aria-modal="true">
        <header>
          <h2>{t(lang, editing ? 'editShoot' : 'newShoot')}</h2>
          <button className="icon" aria-label={t(lang, 'close')} onClick={onClose}>
            ×
          </button>
        </header>
        <fieldset className="form-grid plain" disabled={!canEdit}>
          <label className="wide">
            {t(lang, 'shootTitle')}
            <input value={title} placeholder={t(lang, 'shootTitlePh')} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            {t(lang, 'date')}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            {t(lang, 'shootLocation')}
            <input value={location} placeholder={t(lang, 'shootLocationPh')} maxLength={120} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label>
            {t(lang, 'startTime')}
            <input type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            {t(lang, 'endTime')}
            <input type="time" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          {input && bkkDate(new Date(Date.parse(input.end) - 1)) !== date && (
            <p className="hint wide overnight-hint">
              {t(lang, 'overnightHint')
                .replace('{start}', `${formatDay(bkkDate(new Date(input.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' })} ${start}`)
                .replace('{end}', `${formatDay(bkkDate(new Date(input.end)), lang, { weekday: 'short', day: 'numeric', month: 'short' })} ${end}`)}
            </p>
          )}
          <div className="wide">
            <span className="field-label">{t(lang, 'shootPeople')}</span>
            <div className="person-picks">
              {choices.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pick${personIds.includes(p.id) ? ' on' : ''}${personIds.includes(p.id) && blockedIds.has(p.id) ? ' blocked' : ''}`}
                  aria-pressed={personIds.includes(p.id)}
                  onClick={() => toggle(p.id)}
                >
                  {p.nickname} <small>{p.position.toUpperCase()}</small>
                </button>
              ))}
            </div>
            <p className="hint">{t(lang, 'shootPeopleHint')}</p>
          </div>
          <label className="wide">
            {t(lang, 'note')}
            <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </label>
        </fieldset>

        {canEdit && (
          <ul className="checks" aria-live="polite">
            {input && input.title && violations.length === 0 && <li className="ok">{t(lang, 'checksOk')}</li>}
            {violations.map((v, i) => (
              <li key={i} className={v.severity}>
                {v.severity === 'error' ? '✕ ' : '! '}
                {violationMessage(lang, v, nameOf, codeOf)}
              </li>
            ))}
          </ul>
        )}
        {editing?.createdBy && (
          <p className="hint">
            {t(lang, 'shootBy')} {editing.createdBy}
          </p>
        )}

        {editing && canEdit && (
          <details className="danger-zone">
            <summary>{t(lang, 'deleteShoot')}</summary>
            <button className="danger" disabled={busy} onClick={remove}>
              {t(lang, 'deleteShoot')}
            </button>
          </details>
        )}

        <footer>
          <button onClick={onClose}>{t(lang, 'close')}</button>
          {canEdit && (
            <button className="primary" disabled={busy || !input || !input.title || personIds.length === 0 || errors.length > 0} onClick={save}>
              {t(lang, needsConfirm ? 'saveAnyway' : editing ? 'saveChanges' : 'saveShoot')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
