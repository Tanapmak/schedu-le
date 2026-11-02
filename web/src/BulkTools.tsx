import { useState } from 'react';
import { api, downloadImportTemplate, type BulkRow, type Person, type Room } from './api';
import { t, violationMessage, type Lang, type StringKey } from './i18n';
import { addDays, bkkTime, formatDay, liveDate, mondayOf } from './time';
import { Modal, Tabs } from './ui';

type Tab = 'copy' | 'import';

/** Fill a new week or month fast: copy a week by weekday, or import a sheet. Everything lands as drafts. */
export function BulkTools({
  lang,
  date,
  rooms,
  people,
  onClose,
  onDone,
}: {
  lang: Lang;
  date: string;
  rooms: Room[];
  people: Person[];
  onClose: () => void;
  onDone: (firstDate: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('copy');
  return (
    <Modal title={t(lang, 'bulkTitle')} onClose={onClose} footer={null} wide>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'copy', label: t(lang, 'copyTab') },
          { key: 'import', label: t(lang, 'importTab') },
        ]}
      />
      {tab === 'copy' ? (
        <CopyPanel lang={lang} date={date} rooms={rooms} people={people} onDone={onDone} />
      ) : (
        <ImportPanel lang={lang} rooms={rooms} people={people} onDone={onDone} />
      )}
    </Modal>
  );
}

const endOfMonth = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function CopyPanel({ lang, date, rooms, people, onDone }: { lang: Lang; date: string; rooms: Room[]; people: Person[]; onDone: (d: string | null) => void }) {
  const [source, setSource] = useState(mondayOf(date));
  const nextMonday = addDays(source, 7);
  const [targetFrom, setTargetFrom] = useState(nextMonday);
  const [targetTo, setTargetTo] = useState(addDays(nextMonday, 6));
  const [preview, setPreview] = useState<BulkRow[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sourceTo = addDays(source, 6);
  const day = (d: string) => formatDay(d, lang, { weekday: 'short', day: 'numeric', month: 'short' });

  const range = { sourceFrom: source, sourceTo, targetFrom, targetTo };
  const changed = () => (setPreview(undefined), setError(''));

  async function run(dryRun: boolean) {
    setBusy(true);
    setError('');
    try {
      const out = await api.copySessions(range, dryRun);
      if (!out.rows) return setError(out.message ?? t(lang, 'loadFailed'));
      if (dryRun) setPreview(out.rows);
      else onDone(targetFrom);
    } finally {
      setBusy(false);
    }
  }

  function moveSource(weeks: number) {
    const s = addDays(source, weeks * 7);
    setSource(s);
    setTargetFrom(addDays(s, 7));
    setTargetTo(addDays(s, 13));
    changed();
  }

  const good = preview?.filter((r) => r.ok).length ?? 0;
  return (
    <div className="bulk-panel">
      <p className="hint">{t(lang, 'copyHint')}</p>
      <div className="bulk-step">
        <strong>{t(lang, 'copyFrom')}</strong>
        <div className="nav">
          <button aria-label="previous" onClick={() => moveSource(-1)}>‹</button>
          <span className="bulk-week">
            {day(source)} – {day(sourceTo)}
          </span>
          <button aria-label="next" onClick={() => moveSource(1)}>›</button>
        </div>
      </div>
      <div className="bulk-step">
        <strong>{t(lang, 'copyTo')}</strong>
        <div className="bulk-dates">
          <input type="date" value={targetFrom} onChange={(e) => (setTargetFrom(e.target.value), changed())} />
          <span>–</span>
          <input type="date" value={targetTo} onChange={(e) => (setTargetTo(e.target.value), changed())} />
        </div>
        <div className="bulk-quick">
          <button className="link" onClick={() => (setTargetFrom(nextMonday), setTargetTo(addDays(nextMonday, 6)), changed())}>
            {t(lang, 'copyNextWeek')}
          </button>
          <button className="link" onClick={() => (setTargetFrom(nextMonday), setTargetTo(endOfMonth(nextMonday)), changed())}>
            {t(lang, 'copyToMonthEnd')}
          </button>
          <button
            className="link"
            onClick={() => {
              const first = addDays(endOfMonth(source), 1);
              setTargetFrom(first);
              setTargetTo(endOfMonth(first));
              changed();
            }}
          >
            {t(lang, 'copyNextMonth')}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {preview && <Preview lang={lang} rows={preview} rooms={rooms} people={people} />}

      <div className="row-actions bulk-actions">
        {!preview ? (
          <button className="primary" disabled={busy || !targetFrom || !targetTo} onClick={() => void run(true)}>
            {busy ? '…' : t(lang, 'checkFirst')}
          </button>
        ) : (
          <button className="primary" disabled={busy || good === 0} onClick={() => void run(false)}>
            {t(lang, 'addDrafts').replace('{n}', String(good))}
          </button>
        )}
      </div>
    </div>
  );
}

function ImportPanel({ lang, rooms, people, onDone }: { lang: Lang; rooms: Room[]; people: Person[]; onDone: (d: string | null) => void }) {
  const [file, setFile] = useState<{ name: string; data: string }>();
  const [preview, setPreview] = useState<BulkRow[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined) {
    setPreview(undefined);
    setError('');
    if (!f) return setFile(undefined);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
    const picked = { name: f.name, data };
    setFile(picked);
    void run(true, picked);
  }

  async function run(dryRun: boolean, f = file) {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const out = await api.importSessions(f.name, f.data, dryRun);
      if (!out.rows) return setError(out.message ?? t(lang, 'loadFailed'));
      if (dryRun) setPreview(out.rows);
      else {
        const first = out.rows.filter((r) => r.ok && r.start).map((r) => r.start!).sort()[0];
        onDone(first ? liveDate(new Date(first)) : null);
      }
    } finally {
      setBusy(false);
    }
  }

  const good = preview?.filter((r) => r.ok).length ?? 0;
  return (
    <div className="bulk-panel">
      <ol className="bulk-howto">
        <li>
          <button className="link" onClick={() => void downloadImportTemplate()}>
            {t(lang, 'importDownload')}
          </button>{' '}
          {t(lang, 'importStep1')}
        </li>
        <li>{t(lang, 'importStep2')}</li>
        <li>{t(lang, 'importStep3')}</li>
      </ol>
      <label className="file-pick">
        <input type="file" accept=".xlsx,.csv" onChange={(e) => void pick(e.target.files?.[0])} />
        <span className="button">{file ? file.name : t(lang, 'importChoose')}</span>
      </label>

      {busy && !preview && <p className="muted">{t(lang, 'loading')}</p>}
      {error && <p className="error">{error}</p>}
      {preview && <Preview lang={lang} rows={preview} rooms={rooms} people={people} showRow />}

      {preview && (
        <div className="row-actions bulk-actions">
          <button className="primary" disabled={busy || good === 0} onClick={() => void run(false)}>
            {t(lang, 'addDrafts').replace('{n}', String(good))}
          </button>
        </div>
      )}
    </div>
  );
}

/** What will be added, and every skipped row with its reason. */
function Preview({ lang, rows, rooms, people, showRow }: { lang: Lang; rows: BulkRow[]; rooms: Room[]; people: Person[]; showRow?: boolean }) {
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;
  const codeOf = (id: number) => rooms.find((r) => r.id === id)?.code ?? `#${id}`;
  const good = rows.filter((r) => r.ok).length;
  const skipped = rows.length - good;
  const why = (r: BulkRow) =>
    [
      ...r.problems.map((p) => t(lang, `importErr_${p}` as StringKey)),
      ...r.violations.map((v) => (v.severity === 'warning' ? '⚠ ' : '') + violationMessage(lang, v, nameOf, codeOf)),
    ].join(' · ');

  if (rows.length === 0) return <p className="warning-text">{t(lang, 'copyNothing')}</p>;
  return (
    <div className="bulk-preview">
      <p>
        <strong className="ok-text">{t(lang, 'willAdd').replace('{n}', String(good))}</strong>
        {skipped > 0 && <strong className="error"> · {t(lang, 'willSkip').replace('{n}', String(skipped))}</strong>}
      </p>
      <div className="table-wrap">
        <table className="data bulk">
          <thead>
            <tr>
              {showRow && <th>{t(lang, 'sheetRow')}</th>}
              <th>{t(lang, 'session')}</th>
              <th>MC / PD</th>
              <th>{t(lang, 'status')}</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => Number(a.ok) - Number(b.ok) || a.row - b.row)
              .map((r) => (
                <tr key={r.row} className={r.ok ? '' : 'row-alert'}>
                  {showRow && <td className="num">{r.row}</td>}
                  <td>
                    {r.start && r.end && r.roomId
                      ? `${formatDay(liveDate(new Date(r.start)), lang, { weekday: 'short', day: 'numeric', month: 'short' })} · ${bkkTime(new Date(r.start))}–${bkkTime(new Date(r.end))} · ${codeOf(r.roomId)}`
                      : '—'}
                  </td>
                  <td>{r.staff?.map((s) => nameOf(s.personId)).join(' · ') || '—'}</td>
                  <td>
                    {r.ok ? <span className="pill st-ok">{t(lang, 'willAddOne')}</span> : <span className="pill st-bad">{t(lang, 'skipped')}</span>}
                    {why(r) && <small className="block muted">{why(r)}</small>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
