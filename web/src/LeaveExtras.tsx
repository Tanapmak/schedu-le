import { useEffect, useRef, useState } from 'react';
import {
  api,
  devUser,
  LEAVE_REASONS,
  type CancelReason,
  type CreditChoice,
  type HoursCredit,
  type LeaveDocument,
  type LeaveReason,
  type Person,
  type StaffCredit,
} from './api';
import { t, type Lang, type StringKey } from './i18n';
import { bkkDate, bkkTime, formatDay } from './time';

/** Urgent leave reasons and hours on cancelled sessions: the pieces several pages share. */

export const reasonKey: Record<LeaveReason, StringKey> = {
  sick: 'reasonSick',
  accident: 'reasonAccident',
  family: 'reasonFamily',
  errand: 'reasonErrand',
  other: 'reasonOther',
};

export const cancelKey: Record<CancelReason, StringKey> = {
  leave_no_cover: 'cancelLeaveNoCover',
  force_majeure: 'cancelForceMajeure',
  meeting: 'cancelMeeting',
  brand: 'cancelBrand',
  other: 'reasonOther',
};

/** "Sick · fever since morning", or just the free text for old leave without a code. */
export function leaveReasonText(lang: Lang, l: { reasonCode?: LeaveReason | null; reason: string | null }): string {
  const label = l.reasonCode ? t(lang, reasonKey[l.reasonCode]) : '';
  return [label, l.reason].filter(Boolean).join(' · ') || '—';
}

/** "Urgent leave this month: Sick 2 · Errand 1" for whoever approves. */
export function UrgentStats({ lang, counts }: { lang: Lang; counts?: Partial<Record<LeaveReason, number>> }) {
  const parts = LEAVE_REASONS.filter((r) => counts?.[r]).map((r) => `${t(lang, reasonKey[r])} ${counts![r]} ${t(lang, 'timesSuffix')}`);
  if (parts.length === 0) return null;
  const total = LEAVE_REASONS.reduce((a, r) => a + (counts?.[r] ?? 0), 0);
  return (
    <p className={`hint urgent-stats${total >= 3 ? ' warn' : ''}`}>
      {t(lang, 'urgentThisMonth')}: {parts.join(' · ')}
    </p>
  );
}

const fmtDay = (lang: Lang, iso: string) => formatDay(bkkDate(new Date(iso)), lang, { day: 'numeric', month: 'short' });

/** One person's hours on a cancelled session, in words. */
export function creditText(lang: Lang, c: StaffCredit['credit']): string {
  const values: Record<string, string> = {
    at: c.decidesAt ? `${fmtDay(lang, c.decidesAt)} ${bkkTime(new Date(c.decidesAt))}` : '',
    days: String(c.sickRun?.length ?? ''),
    until: c.certDeadline ? fmtDay(lang, new Date(Date.parse(c.certDeadline) - 1).toISOString()) : '',
  };
  return t(lang, `code_${c.code}` as StringKey).replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

const statusKey = { credited: 'creditCredited', not_credited: 'creditNotCredited', pending: 'creditPending' } as const;

/**
 * Who earns hours on a session being cancelled (preview) or already cancelled. Each person
 * follows the rules by default; a manager may give or take hours with a note.
 */
export function CreditPanel({
  lang,
  sessionId,
  people,
  preview,
  onChange,
  refreshKey,
}: {
  lang: Lang;
  sessionId: number;
  people: Person[];
  /** The session is not cancelled yet: show what cancelling it now would give. */
  preview: boolean;
  onChange: (choices: CreditChoice[], valid: boolean) => void;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<StaffCredit[]>();
  const [choices, setChoices] = useState<Record<number, { credit: HoursCredit; note: string }>>({});
  const nameOf = (id: number) => people.find((p) => p.id === id)?.nickname ?? `#${id}`;

  useEffect(() => {
    void api.credits(sessionId, preview).then((r) => {
      setRows(r);
      setChoices(Object.fromEntries(r.map((x) => [x.personId, { credit: x.hoursCredit, note: x.creditNote ?? '' }])));
    });
  }, [sessionId, preview, refreshKey]);

  useEffect(() => {
    const list = Object.entries(choices).map(([id, c]) => ({ personId: Number(id), credit: c.credit, note: c.note.trim() || undefined }));
    onChange(list, list.every((c) => c.credit === 'auto' || c.note));
  }, [choices]);

  if (!rows) return <p className="muted">{t(lang, 'loading')}</p>;
  const set = (id: number, patch: Partial<{ credit: HoursCredit; note: string }>) =>
    setChoices((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

  return (
    <div className="credit-panel">
      <strong>{t(lang, 'hoursPerPerson')}</strong>
      <ul>
        {rows
          .filter((r) => !r.replaced)
          .map((r) => {
            const choice = choices[r.personId] ?? { credit: 'auto', note: '' };
            const status = choice.credit === 'yes' ? 'credited' : choice.credit === 'no' ? 'not_credited' : r.credit.status;
            return (
              <li key={r.personId}>
                <div className="credit-row">
                  <span className="credit-who">
                    {nameOf(r.personId)} <span className="muted">({r.role.toUpperCase()})</span>
                  </span>
                  <span className={`credit-status ${status}`}>{t(lang, statusKey[status])}</span>
                  <select value={choice.credit} onChange={(e) => set(r.personId, { credit: e.target.value as HoursCredit })}>
                    <option value="auto">{t(lang, 'creditAuto')}</option>
                    <option value="yes">{t(lang, 'creditYes')}</option>
                    <option value="no">{t(lang, 'creditNo')}</option>
                  </select>
                </div>
                {choice.credit === 'auto' ? (
                  <p className="hint">{creditText(lang, r.credit)}</p>
                ) : (
                  <input placeholder={t(lang, 'creditNote')} value={choice.note} onChange={(e) => set(r.personId, { note: e.target.value })} />
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

/** Reads a file as a base64 data URL. */
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** Opens a stored file in a new tab (fetched with the dev user header, so it works locally too). */
async function openDocument(id: number) {
  const asUser = devUser();
  const res = await fetch(`/api/leave-documents/${id}`, { headers: asUser ? { 'x-dev-user': asUser } : {} });
  if (!res.ok) return;
  window.open(URL.createObjectURL(await res.blob()), '_blank');
}

/** Medical certificates on a leave request: list, open, and attach (the person or a manager). */
export function LeaveDocs({ lang, leaveId, count, canAdd }: { lang: Lang; leaveId: number; count: number; canAdd: boolean }) {
  const [docs, setDocs] = useState<LeaveDocument[]>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (count > 0) void api.leaveDocuments(leaveId).then(setDocs, () => setDocs([]));
    else setDocs([]);
  }, [leaveId, count]);

  async function upload(file: File) {
    setError(false);
    if (file.size > 5 * 1024 * 1024) return setError(true);
    setBusy(true);
    try {
      const out = await api.addLeaveDocument(leaveId, file.name, await readAsDataUrl(file));
      if (!out.ok) return setError(true);
      setDocs(await api.leaveDocuments(leaveId));
    } finally {
      setBusy(false);
    }
  }

  if (!docs?.length && !canAdd) return null;
  return (
    <div className="leave-docs" onClick={(e) => e.stopPropagation()}>
      {docs?.map((d) => (
        <button key={d.id} className="link" onClick={() => void openDocument(d.id)}>
          📎 {d.fileName}
        </button>
      ))}
      {canAdd && (
        <>
          <button className="link" disabled={busy} onClick={() => input.current?.click()}>
            + {t(lang, 'attachCert')}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f);
            }}
          />
        </>
      )}
      {error && <span className="error-text">{t(lang, 'certTooBig')}</span>}
    </div>
  );
}
