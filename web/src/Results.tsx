import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { api, METRICS, type Metric, type Person, type Reading, type ResultRow, type Room, type Session, type User } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { addDays, bkkDate, bkkInstant, bkkTime, todayBkk } from './time';
import { sessionLabel } from './ui';

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
async function toDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

const localInput = (d: Date) => `${bkkDate(d)}T${bkkTime(d)}`; // for <input type="datetime-local">, Bangkok time
const fromLocalInput = (v: string) => (v ? bkkInstant(v.slice(0, 10), v.slice(11, 16)).toISOString() : null);
const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '–' : n.toLocaleString('en-US', { maximumFractionDigits: digits });

export function ResultsPage({ lang, user, rooms, people, aiReader }: Props) {
  const [date, setDate] = useState(todayBkk());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rows, setRows] = useState<ResultRow[]>();
  const [sessionId, setSessionId] = useState(0);

  const load = useCallback(() => {
    const from = bkkInstant(date, '00:00');
    const to = bkkInstant(addDays(date, 1), '06:00'); // late lives run past midnight
    api.board(from, to).then((b) => {
      const isAdmin = user.role === 'admin';
      const list = b.sessions.filter(
        (s) => s.status !== 'draft' && bkkDate(new Date(s.start)) === date && (isAdmin || s.staff.some((x) => x.personId === user.id && !x.replaced)),
      );
      setSessions(list);
      // Default to the session running now, else the latest one that has started.
      const now = Date.now();
      const current = list.find((s) => new Date(s.start).getTime() <= now && new Date(s.end).getTime() > now)
        ?? [...list].reverse().find((s) => new Date(s.start).getTime() <= now) ?? list[0];
      setSessionId((id) => (list.some((s) => s.id === id) ? id : current?.id ?? 0));
    });
    api.results(from, to).then(setRows, () => setRows([]));
  }, [date, user]);
  useEffect(load, [load]);

  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(lang, 'results')}</h1>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={t(lang, 'date')} />
      </div>

      <section className="result-card">
        <h2>{t(lang, 'recordResult')}</h2>
        {sessions.length === 0 ? (
          <p className="muted">{t(lang, 'noSessionsToday')}</p>
        ) : (
          <>
            <label className="field">
              {t(lang, 'session')}
              <select value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionLabel(lang, s, rooms)} · {s.staff.filter((x) => !x.replaced).map((x) => people.find((p) => p.id === x.personId)?.nickname).join(' / ')}
                  </option>
                ))}
              </select>
            </label>
            {sessionId > 0 && <ResultForm key={sessionId} lang={lang} sessionId={sessionId} aiReader={aiReader} onSaved={load} />}
          </>
        )}
      </section>

      <section>
        <h2>{t(lang, 'todaysReadings')}</h2>
        <p className="hint">{t(lang, 'gmvNote')}</p>
        {rows && rows.length === 0 && <p className="muted">{t(lang, 'noReadings')}</p>}
        {rows && rows.length > 0 && (
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
                  <tr key={r.id}>
                    <td>{bkkTime(new Date(r.capturedAt))}</td>
                    <td>{codeOf(r.roomId)}</td>
                    <td>
                      <span className={`pill ${r.isNewBroadcast ? 'status-approved' : ''}`}>{t(lang, r.isNewBroadcast ? 'flagNew' : 'flagContinue')}</span>
                    </td>
                    <td className="num">{fmt(r.gmv)}</td>
                    <td className="num pos">{r.gmvDelta !== null ? `+${fmt(r.gmvDelta)}` : '–'}</td>
                    <td className="num">{fmt(r.orders)}</td>
                    <td className="num">{fmt(r.views)}</td>
                    <td>
                      {r.recordedBy}
                      {r.source === 'ai' && <span className="tag ai-tag">AI</span>}
                    </td>
                    <td>
                      {(user.role === 'admin' || r.recordedBy === user.nickname) && (
                        <button
                          className="link danger-link"
                          onClick={async () => {
                            if (window.confirm(`${t(lang, 'remove')}?`) && (await api.deleteResult(r.id)).ok) load();
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
        )}
      </section>
    </div>
  );
}

type AiState = 'idle' | 'reading' | 'done' | 'failed';

function ResultForm({ lang, sessionId, aiReader, onSaved }: { lang: Lang; sessionId: number; aiReader: boolean; onSaved: () => void }) {
  const [image, setImage] = useState<string>();
  const [ai, setAi] = useState<AiState>('idle');
  const [reading, setReading] = useState<Reading | null>(null);
  const [values, setValues] = useState<Partial<Record<Metric, string>>>({});
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);
  const [capturedAt, setCapturedAt] = useState(localInput(new Date()));
  const [liveStartedAt, setLiveStartedAt] = useState('');
  const [isNew, setIsNew] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Suggest the flag from the room's last reading, for hand-typed results too.
  useEffect(() => {
    api.suggestFlag(sessionId, fromLocalInput(liveStartedAt)).then(setIsNew, () => undefined);
  }, [sessionId, liveStartedAt]);

  async function useImage(file: Blob) {
    const url = await toDataUrl(file);
    setImage(url);
    setMessage('');
    if (aiReader) await read(url);
  }

  async function read(url = image) {
    if (!url) return;
    setAi('reading');
    try {
      const { status, data } = await api.readScreenshot(sessionId, url);
      if (status !== 200) throw new Error(data.error);
      const r = data.reading;
      setReading(r);
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
  const hasNumbers = METRICS.some((m) => values[m]);

  async function save() {
    setBusy(true);
    try {
      const metrics = Object.fromEntries(METRICS.filter((m) => values[m]).map((m) => [m, Number(values[m])]));
      const { status, data } = await api.saveResult({
        sessionId,
        capturedAt: fromLocalInput(capturedAt) ?? new Date().toISOString(),
        liveStartedAt: fromLocalInput(liveStartedAt),
        isNewBroadcast: isNew,
        metrics,
        extraMetrics: Object.fromEntries(extra.filter((x) => x.label.trim()).map((x) => [x.label, x.value])),
        source: reading ? 'ai' : 'manual',
        aiReading: reading,
        note: note.trim() || undefined,
      });
      if (status !== 201) return setMessage(data.message ?? t(lang, 'loadFailed'));
      setMessage(t(lang, 'saved'));
      setImage(undefined);
      setReading(null);
      setValues({});
      setExtra([]);
      setNote('');
      setAi('idle');
      setCapturedAt(localInput(new Date()));
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="result-form" onPaste={onPaste}>
      <div
        className={`dropzone ${image ? 'has-image' : ''}`}
        tabIndex={0}
        role="button"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {image ? <img src={image} alt="" /> : <span>{t(lang, 'dropHint')}</span>}
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

      <div className="result-fields">
        <p className={`ai-status ${ai}`} aria-live="polite">
          {!aiReader ? t(lang, 'aiOff') : ai === 'reading' ? t(lang, 'aiReading') : ai === 'done' ? t(lang, 'aiDone') : ai === 'failed' ? t(lang, 'aiFailed') : ''}
          {aiReader && image && ai !== 'reading' && (
            <button className="link" onClick={() => read()}>
              {t(lang, 'readAgain')}
            </button>
          )}
        </p>
        <div className="form-grid">
          <label>
            {t(lang, 'capturedAt')}
            <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          </label>
          <label>
            {t(lang, 'liveStartedAt')}
            <input type="datetime-local" value={liveStartedAt} onChange={(e) => setLiveStartedAt(e.target.value)} />
          </label>
          <div className="wide">
            <div className="segmented" role="group" aria-label={t(lang, 'flag')}>
              <button className={isNew ? 'active' : ''} onClick={() => setIsNew(true)}>
                {t(lang, 'flagNew')}
              </button>
              <button className={!isNew ? 'active' : ''} onClick={() => setIsNew(false)}>
                {t(lang, 'flagContinue')}
              </button>
            </div>
            <p className="hint">{t(lang, 'flagHint')}</p>
          </div>
          {METRICS.map((m) => (
            <label key={m} className={unsure.has(readingKey[m]) ? 'unsure' : ''}>
              {t(lang, `m_${m}` as StringKey)}
              <input
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
                <span key={i} className="pill">
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
        <footer className="result-actions">
          {message && <span className="muted">{message}</span>}
          <button className="primary" disabled={busy || ai === 'reading' || !hasNumbers} onClick={save}>
            {t(lang, 'confirmSave')}
          </button>
        </footer>
      </div>
    </div>
  );
}
