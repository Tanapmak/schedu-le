import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { api, METRICS, type FlagInfo, type Metric, type Person, type Reading, type ReadingBox, type ResultRow, type Room, type Session, type User, isManager } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { Board } from './Board';
import { bkkDate, bkkInstant, bkkTime } from './time';
import { Modal, sessionLabel } from './ui';

interface Props {
  lang: Lang;
  user: User;
  rooms: Room[];
  people: Person[];
  aiReader: boolean;
}

// Reading field (snake_case from the AI) for each form metric.
const readingKey: Record<Metric, keyof Reading> = {
  gmv: 'gmv', orders: 'orders', itemsSold: 'items_sold', views: 'views', avgViewSec: 'avg_view_sec',
  productClicks: 'product_clicks', buyers: 'buyers', addToCart: 'add_to_cart', adsCost: 'ads_cost', durationMin: 'duration_min',
};

/** Shrinks a photo to at most 1600 px on the long side as JPEG, so uploads stay small and fast. */
async function toDataUrl(file: Blob): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { url: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height };
}
interface Shot { url: string; width: number; height: number }

/** The screenshot with the AI's boxes drawn over it; `active` is highlighted. */
function BoxedImage({ shot, boxes, active, label, onPick, reading }: {
  shot: Shot; boxes: ReadingBox[]; active: string | null; label: (field: string) => string; onPick?: (field: string) => void; reading?: boolean;
}) {
  return (
    <div className={`boxed ${reading ? 'is-reading' : ''}`}>
      <img src={shot.url} alt="" />
      {boxes.map((b, i) => (
        <button
          key={i}
          type="button"
          className={`read-box ${active === b.field ? 'active' : ''} ${active && active !== b.field ? 'dim' : ''}`}
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          title={label(b.field)}
          onClick={(e) => (e.stopPropagation(), onPick?.(b.field))}
        >
          <span>{label(b.field)}</span>
        </button>
      ))}
      {reading && <div className="scan" aria-hidden="true" />}
    </div>
  );
}

const localInput = (d: Date) => `${bkkDate(d)}T${bkkTime(d)}`; // for <input type="datetime-local">, Bangkok time
const fromLocalInput = (v: string) => (v ? bkkInstant(v.slice(0, 10), v.slice(11, 16)).toISOString() : null);
const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '–' : n.toLocaleString('en-US', { maximumFractionDigits: digits });

/** "5 Nov 14:00" in Bangkok time. */
const whenLabel = (lang: Lang, iso: string, withTime = true) => {
  const d = new Date(iso);
  const day = new Date(d.getTime() + 7 * 3_600_000).toLocaleDateString(lang === 'th' ? 'th-TH' : lang === 'zh' ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return withTime ? `${day} ${bkkTime(d)}` : day;
};

export function ResultsPage({ lang, user, rooms, people, aiReader }: Props) {
  const [range, setRange] = useState<{ from: Date; to: Date }>();
  const [rows, setRows] = useState<ResultRow[]>();
  const [open, setOpen] = useState<Session>();
  const [editing, setEditing] = useState<ResultRow>();
  const [policy, setPolicy] = useState<FlagInfo>();
  const isAdmin = isManager(user.role);

  const load = useCallback(() => {
    if (range) api.results(range.from, range.to).then(setRows, () => setRows([]));
  }, [range?.from.getTime(), range?.to.getTime()]);
  useEffect(load, [load]);
  useEffect(() => {
    setPolicy(undefined);
    setEditing(undefined);
    if (open) api.flagInfo(open.id, null).then(setPolicy, () => undefined);
  }, [open?.id]);

  // Latest GMV recorded for each session, shown on its card.
  const latest = new Map<number, ResultRow>();
  for (const r of rows ?? []) {
    if (r.sessionId === null) continue;
    const prev = latest.get(r.sessionId);
    if (!prev || prev.capturedAt < r.capturedAt) latest.set(r.sessionId, r);
  }
  const counts = new Map<number, number>();
  for (const r of rows ?? []) if (r.sessionId !== null) counts.set(r.sessionId, (counts.get(r.sessionId) ?? 0) + 1);
  const mine = (s: Session) => s.staff.some((x) => x.personId === user.id && !x.replaced);
  const canOpen = (s: Session) => isAdmin || mine(s);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'results')}</h1>
          <p className="sub">{t(lang, 'resultsBoardHint')}</p>
        </div>
      </div>

      <Board
        lang={lang}
        rooms={rooms}
        people={people}
        user={user}
        mode="results"
        onRange={(from, to) => setRange({ from, to })}
        onSessionOpen={(s) => (canOpen(s) ? setOpen(s) : window.alert(t(lang, 'notYourSession')))}
        badge={(s) => {
          const r = latest.get(s.id);
          if (r) return `GMV ${fmt(r.gmv)} · ${counts.get(s.id)} ${t(lang, 'readingsShort')}`;
          return new Date(s.start).getTime() <= Date.now() && canOpen(s) ? t(lang, 'noResultYet') : undefined;
        }}
      />

      {open && (
        <Modal
          title={`${t(lang, editing ? 'editReading' : 'recordResult')} · ${sessionLabel(lang, open, rooms)}`}
          onClose={() => setOpen(undefined)}
          footer={null}
          wide
        >
          <p className="muted">
            {open.staff
              .filter((x) => !x.replaced)
              .map((x) => `${people.find((p) => p.id === x.personId)?.nickname} (${t(lang, x.role)})`)
              .join(' · ')}
          </p>
          {policy && (
            <p className="hint">
              {t(lang, 'recordUntil').replace('{when}', whenLabel(lang, policy.cutoff, false))} · {t(lang, 'editUntil').replace('{when}', whenLabel(lang, policy.editUntil))}
              {isAdmin && ` · ${t(lang, 'adminNoLimit')}`}
            </p>
          )}
          <ResultForm
            key={editing?.id ?? 'new'}
            lang={lang}
            session={open}
            aiReader={aiReader}
            editing={editing}
            onSaved={() => (setEditing(undefined), load())}
            onCancelEdit={() => setEditing(undefined)}
          />
          <h3>{t(lang, 'sessionReadings')}</h3>
          <Readings
            lang={lang}
            user={user}
            rooms={rooms}
            rows={(rows ?? []).filter((r) => r.sessionId === open.id)}
            canEdit={Boolean(policy?.canEdit)}
            editingId={editing?.id}
            onEdit={setEditing}
            onChanged={load}
          />
        </Modal>
      )}
    </div>
  );
}

function Readings({ lang, user, rooms, rows, canEdit, editingId, onEdit, onChanged }: {
  lang: Lang; user: User; rooms: Room[]; rows: ResultRow[]; canEdit: boolean; editingId?: number; onEdit: (r: ResultRow) => void; onChanged: () => void;
}) {
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  if (rows.length === 0) return <p className="muted">{t(lang, 'noReadings')}</p>;
  return (
    <>
      <p className="hint">{t(lang, 'gmvNote')}</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t(lang, 'time')}</th>
              <th>{t(lang, 'room')}</th>
              <th>{t(lang, 'flag')}</th>
              <th className="num">GMV</th>
              <th className="num">{t(lang, 'increase')}</th>
              <th className="num">{t(lang, 'm_orders')}</th>
              <th className="num">{t(lang, 'm_views')}</th>
              <th>{t(lang, 'recordedBy')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === editingId ? 'mine' : ''}>
                <td>{bkkTime(new Date(r.capturedAt))}</td>
                <td>{codeOf(r.roomId)}</td>
                <td>
                  <span className={`pill ${r.isNewBroadcast ? 'status-approved' : ''}`}>{t(lang, r.isNewBroadcast ? 'flagNew' : 'flagContinue')}</span>
                </td>
                <td className="num">{fmt(r.gmv)}</td>
                <td className={`num ${r.gmvDelta !== null && r.gmvDelta < 0 ? 'neg' : 'pos'}`}>
                  {r.gmvDelta === null ? '–' : r.gmvDelta < 0 ? fmt(r.gmvDelta) : `+${fmt(r.gmvDelta)}`}
                </td>
                <td className="num">{fmt(r.orders)}</td>
                <td className="num">{fmt(r.views)}</td>
                <td>
                  {r.recordedBy}
                  {r.source === 'ai' && <span className="tag ai-tag">AI</span>}
                  {r.version > 1 && <span className="tag" title={t(lang, 'editedHint')}>{t(lang, 'edited')} v{r.version}</span>}
                </td>
                <td className="row-actions">
                  {canEdit && (
                    <button className="link" onClick={() => onEdit(r)}>
                      {t(lang, 'edit')}
                    </button>
                  )}
                  {canEdit && (isManager(user.role) || r.recordedById === user.id) && (
                    <button
                      className="link danger-link"
                      onClick={async () => {
                        if (!window.confirm(`${t(lang, 'remove')}?`)) return;
                        const out = await api.deleteResult(r.id);
                        if (out.ok) onChanged();
                        else window.alert(t(lang, out.error === 'edit_closed' ? 'editClosed' : 'removeBlocked'));
                      }}
                    >
                      {t(lang, 'remove')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type AiState = 'idle' | 'reading' | 'done' | 'failed';

/** Back-recording a finished session: default the capture time to the session's end, not now. */
const defaultCapturedAt = (session: Session) => new Date(Math.min(Date.now(), new Date(session.end).getTime()));

function ResultForm({ lang, session, aiReader, editing, onSaved, onCancelEdit }: {
  lang: Lang; session: Session; aiReader: boolean; editing?: ResultRow; onSaved: () => void; onCancelEdit: () => void;
}) {
  const sessionId = session.id;
  const [image, setImage] = useState<Shot>();
  const [imageChanged, setImageChanged] = useState(false);
  const [flag, setFlag] = useState<FlagInfo>();
  const [boxes, setBoxes] = useState<ReadingBox[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<string, HTMLInputElement | null>>>({});
  const [ai, setAi] = useState<AiState>('idle');
  const [reading, setReading] = useState<Reading | null>(null);
  const [values, setValues] = useState<Partial<Record<Metric, string>>>({});
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);
  const [capturedAt, setCapturedAt] = useState(localInput(defaultCapturedAt(session)));
  const [liveStartedAt, setLiveStartedAt] = useState('');
  const [isNew, setIsNew] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Editing: start from the saved reading and its screenshot.
  useEffect(() => {
    if (!editing) return;
    setValues(Object.fromEntries(METRICS.map((m) => [m, editing[m] == null ? '' : String(editing[m])])));
    setExtra(Object.entries(editing.extraMetrics ?? {}).map(([label, value]) => ({ label, value })));
    setCapturedAt(localInput(new Date(editing.capturedAt)));
    setLiveStartedAt(editing.liveStartedAt ? localInput(new Date(editing.liveStartedAt)) : '');
    setIsNew(editing.isNewBroadcast);
    setNote(editing.note ?? '');
    setReading(editing.aiReading);
    if (editing.hasImage) {
      api.resultImage(editing.id).then(
        (img) => {
          setImage({ url: img.url, width: img.width ?? 0, height: img.height ?? 0 });
          setBoxes(img.boxes ?? []);
        },
        () => undefined,
      );
    }
  }, [editing?.id]);

  // Suggest the flag (a new reading only continues the session that ends right when this one starts).
  useEffect(() => {
    api.flagInfo(sessionId, fromLocalInput(liveStartedAt), editing?.id).then((f) => {
      setFlag(f);
      if (!editing) setIsNew(f.isNewBroadcast);
    }, () => undefined);
  }, [sessionId, liveStartedAt, savedTick]);
  const canContinue = flag?.canContinue ?? true;
  useEffect(() => {
    if (!canContinue) setIsNew(true);
  }, [canContinue, editing?.id]);
  const blocked = flag ? (editing ? !flag.canEdit : !flag.canRecord) : false;

  async function useImage(file: Blob) {
    const shot = await toDataUrl(file);
    setImage(shot);
    setImageChanged(true);
    setBoxes([]);
    setActive(null);
    setMessage('');
    if (aiReader) await read(shot);
  }

  async function read(shot = image) {
    if (!shot) return;
    setAi('reading');
    setBoxes([]);
    try {
      const { status, data } = await api.readScreenshot(sessionId, shot.url, shot.width, shot.height, editing?.id);
      if (status !== 200) throw new Error(data.error);
      const r = data.reading;
      setReading(r);
      setBoxes(data.boxes ?? []);
      setValues(Object.fromEntries(METRICS.map((m) => [m, r[readingKey[m]] == null ? '' : String(r[readingKey[m]])])));
      setExtra(r.extra);
      if (data.liveStartedAt) setLiveStartedAt(localInput(new Date(data.liveStartedAt)));
      setIsNew(data.isNewBroadcast);
      setAi('done');
    } catch {
      setAi('failed');
    }
  }

  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
    if (file) void useImage(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) void useImage(file);
  };

  const unsure = new Set(reading?.unsure ?? []);
  const metricOf = Object.fromEntries(METRICS.map((m) => [readingKey[m], m])) as Record<string, Metric>;
  const boxLabel = (field: string) =>
    field.startsWith('extra:') ? field.slice(6)
      : metricOf[field] ? t(lang, `m_${metricOf[field]}` as StringKey)
      : field === 'live_started_at' ? t(lang, 'liveStartedAt')
      : field === 'account_name' ? t(lang, 'accountName')
      : field;
  const boxed = new Set(boxes.map((b) => b.field));
  // Clicking a box jumps to its field.
  const pick = (field: string) => {
    setActive(field);
    inputs.current[field]?.focus();
  };
  const hover = (field: string) => ({
    onMouseEnter: () => boxed.has(field) && setActive(field),
    onMouseLeave: () => setActive((a) => (a === field ? null : a)),
    onFocus: () => boxed.has(field) && setActive(field),
  });
  const hasNumbers = METRICS.some((m) => values[m]);

  async function save() {
    setBusy(true);
    try {
      const metrics = Object.fromEntries(METRICS.filter((m) => values[m]).map((m) => [m, Number(values[m])]));
      const sendImage = image && (!editing || imageChanged);
      const input = {
        sessionId,
        capturedAt: fromLocalInput(capturedAt) ?? new Date().toISOString(),
        liveStartedAt: fromLocalInput(liveStartedAt),
        isNewBroadcast: isNew,
        metrics,
        extraMetrics: Object.fromEntries(extra.filter((x) => x.label.trim()).map((x) => [x.label, x.value])),
        source: reading ? ('ai' as const) : ('manual' as const),
        aiReading: reading,
        note: note.trim() || undefined,
        ...(sendImage ? { image: image.url, width: image.width || undefined, height: image.height || undefined, boxes } : {}),
      };
      const { status, data } = editing ? await api.editResult(editing.id, input) : await api.saveResult(input);
      if (status !== 201 && status !== 200) {
        return setMessage(
          data.error === 'record_closed' ? t(lang, 'recordClosed')
            : data.error === 'edit_closed' ? t(lang, 'editClosed')
              : data.error === 'already_edited' ? t(lang, 'alreadyEdited')
                : data.message ?? t(lang, 'loadFailed'),
        );
      }
      setMessage(t(lang, 'saved'));
      setImage(undefined);
      setImageChanged(false);
      setBoxes([]);
      setActive(null);
      setReading(null);
      setValues({});
      setExtra([]);
      setNote('');
      setAi('idle');
      setCapturedAt(localInput(defaultCapturedAt(session)));
      setSavedTick((n) => n + 1);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="result-form" onPaste={onPaste}>
      <div className="shot">
        <div
          className={`dropzone ${image ? 'has-image' : ''}`}
          tabIndex={0}
          role="button"
          title={image ? t(lang, 'zoomHint') : undefined}
          onClick={() => (image ? setZoom(true) : fileRef.current?.click())}
          onKeyDown={(e) => e.key === 'Enter' && (image ? setZoom(true) : fileRef.current?.click())}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {image ? (
            <BoxedImage shot={image} boxes={boxes} active={active} label={boxLabel} onPick={pick} reading={ai === 'reading'} />
          ) : (
            <span>{t(lang, 'dropHint')}</span>
          )}
          {image && ai === 'reading' && (
            <div className="reading-overlay" role="status">
              <span className="spinner" aria-hidden="true" />
              <strong>{t(lang, 'aiReading')}</strong>
              <small>{t(lang, 'aiReadingWait')}</small>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void useImage(f);
              e.target.value = '';
            }}
          />
        </div>
        {image && (
          <div className="shot-actions">
            <button className="link" onClick={() => setZoom(true)}>{t(lang, 'zoomImage')}</button>
            <button className="link" onClick={() => fileRef.current?.click()}>{t(lang, 'changeImage')}</button>
          </div>
        )}
        {zoom && image && (
          <div className="zoom-backdrop" role="dialog" aria-modal="true" onClick={() => setZoom(false)}>
            <button className="zoom-close" aria-label="close" onClick={() => setZoom(false)}>×</button>
            <BoxedImage shot={image} boxes={boxes} active={active} label={boxLabel} />
          </div>
        )}
      </div>

      <div className="result-fields">
        <p className={`ai-status ${ai}`} aria-live="polite">
          {ai === 'reading' && <span className="spinner small" aria-hidden="true" />}
          {!aiReader ? t(lang, 'aiOff') : ai === 'reading' ? t(lang, 'aiReading') : ai === 'done' ? t(lang, 'aiDone') : ai === 'failed' ? t(lang, 'aiFailed') : ''}
          {aiReader && image && ai !== 'reading' && (
            <button className="link" onClick={() => read()}>
              {t(lang, 'readAgain')}
            </button>
          )}
        </p>
        {boxes.length > 0 && ai === 'done' && <p className="hint">{t(lang, 'aiBoxesHint')}</p>}
        <div className="form-grid">
          <label>
            {t(lang, 'capturedAt')}
            <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          </label>
          <label>
            {t(lang, 'liveStartedAt')}
            <input
              type="datetime-local"
              value={liveStartedAt}
              ref={(el) => void (inputs.current.live_started_at = el)}
              {...hover('live_started_at')}
              onChange={(e) => setLiveStartedAt(e.target.value)}
            />
          </label>
          <div className="wide">
            <div className="segmented" role="group" aria-label={t(lang, 'flag')}>
              <button className={isNew ? 'active' : ''} onClick={() => setIsNew(true)}>
                {t(lang, 'flagNew')}
              </button>
              <button
                className={!isNew ? 'active' : ''}
                disabled={!canContinue}
                title={!canContinue ? t(lang, 'noContinueTitle') : undefined}
                onClick={() => setIsNew(false)}
              >
                {t(lang, 'flagContinue')}
              </button>
            </div>
            {!canContinue && (
              <p className="hint warning-text">
                {t(lang, flag?.previousSessionId && !flag.previousHasResult ? 'noContinuePrevMissing' : 'noContinueGap')}
              </p>
            )}
            <p className="hint">{t(lang, 'flagHint')}</p>
          </div>
          {METRICS.map((m) => (
            <label key={m} className={`${unsure.has(readingKey[m]) ? 'unsure' : ''} ${active === readingKey[m] ? 'linked' : ''}`}>
              {t(lang, `m_${m}` as StringKey)}
              {boxed.has(readingKey[m]) && <span className="box-dot" aria-hidden="true" />}
              <input
                ref={(el) => void (inputs.current[readingKey[m]] = el)}
                {...hover(readingKey[m])}
                inputMode="decimal"
                value={values[m] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value.replace(/[^\d.]/g, '') }))}
              />
            </label>
          ))}
          {extra.length > 0 && (
            <div className="wide extra">
              <span className="hint">{t(lang, 'extraMetrics')}</span>
              {extra.map((x, i) => (
                <span
                  key={i}
                  className={`pill ${boxed.has(`extra:${x.label}`) ? 'has-box' : ''} ${active === `extra:${x.label}` ? 'linked' : ''}`}
                  tabIndex={boxed.has(`extra:${x.label}`) ? 0 : undefined}
                  {...hover(`extra:${x.label}`)}
                >
                  {x.label}: {x.value}
                </span>
              ))}
            </div>
          )}
          <label className="wide">
            {t(lang, 'note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        {blocked && <p className="notice-bar">{t(lang, editing ? 'editClosed' : 'recordClosed')}</p>}
        {editing && <p className="hint">{t(lang, 'editingHint')}</p>}
        <footer className="result-actions">
          {message && <span className="muted">{message}</span>}
          {editing && (
            <button onClick={onCancelEdit} disabled={busy}>
              {t(lang, 'cancelBtn')}
            </button>
          )}
          <button className="primary" disabled={busy || blocked || ai === 'reading' || !hasNumbers} onClick={save}>
            {t(lang, editing ? 'saveNewVersion' : 'confirmSave')}
          </button>
        </footer>
      </div>
    </div>
  );
}
