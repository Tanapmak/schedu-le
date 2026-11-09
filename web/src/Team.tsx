import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Member, type MemberInput, type Role, type User } from './api';
import { t, type Lang, type StringKey } from './i18n';
import { Modal, Tabs } from './ui';

const ROLES: Role[] = ['admin', 'operation', 'mc', 'pd', 'video', 'viewer'];
const POSITIONS: Member['position'][] = ['mc', 'pd', 'operation'];
const EMPLOYMENTS: Member['employment'][] = ['full_time', 'intern', 'freelance', 'guest'];

const roleLabel: Record<Role, StringKey> = { admin: 'roleAdmin', operation: 'roleOperation', mc: 'roleMc', pd: 'rolePd', video: 'roleVideo', viewer: 'roleViewer' };
const posLabel = (p: Member['position']): StringKey => (p === 'operation' ? 'pos_operation' : p);
const empLabel = (e: Member['employment']): StringKey => `emp_${e}` as StringKey;

/** Master admin page: who is on the team and what each person can do in the app. */
export function TeamPage({ lang, me, onChanged }: { lang: Lang; me: User; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[]>();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Member | 'new'>();
  const [notice, setNotice] = useState('');

  const load = useCallback(() => void api.team().then(setMembers), []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c = new Map<Role | 'all', number>([['all', 0]]);
    for (const m of members ?? []) {
      if (!m.isActive) continue;
      c.set('all', (c.get('all') ?? 0) + 1);
      c.set(m.role, (c.get(m.role) ?? 0) + 1);
    }
    return c;
  }, [members]);

  const q = query.trim().toLowerCase();
  const rows = (members ?? []).filter(
    (m) =>
      (showArchived || m.isActive) &&
      (roleFilter === 'all' || m.role === roleFilter) &&
      (!q || [m.nickname, m.fullName, m.email].some((v) => v?.toLowerCase().includes(q))),
  );

  function saved(member: Member, wasNew: boolean, emailChanged: boolean) {
    setEditing(undefined);
    setNotice(member.email && member.isActive && (wasNew || emailChanged) ? t(lang, 'iapReminder').replace('{email}', member.email) : '');
    load();
    onChanged();
  }

  return (
    <div className="page fill">
      <div className="page-head">
        <div>
          <h1>{t(lang, 'teamTitle')}</h1>
          <p className="sub">{t(lang, 'teamHint')}</p>
        </div>
        <div className="head-actions">
          <button className="primary" onClick={() => setEditing('new')}>
            {t(lang, 'addMember')}
          </button>
        </div>
      </div>

      {notice && <p className="notice-bar">{notice}</p>}

      <div className="team-controls">
        <Tabs
          className="scroll"
          value={roleFilter}
          onChange={setRoleFilter}
          tabs={(['all', ...ROLES] as const).map((r) => ({
            key: r,
            label: (
              <>
                {r === 'all' ? t(lang, 'tabAll') : t(lang, roleLabel[r])} <span className="tab-count">{counts.get(r) ?? 0}</span>
              </>
            ),
          }))}
        />
        <div className="team-search">
          <input type="search" placeholder={`${t(lang, 'nickname')} / Gmail`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {t(lang, 'showArchived')}
          </label>
        </div>
      </div>

      <section className="grow">
        {!members && <p className="muted">{t(lang, 'loading')}</p>}
        {members && (
          <div className="table-wrap table-cards">
            <table className="data team">
              <thead>
                <tr>
                  <th>{t(lang, 'nickname')}</th>
                  <th>Gmail</th>
                  <th>{t(lang, 'position')}</th>
                  <th>{t(lang, 'employment')}</th>
                  <th>{t(lang, 'appRole')}</th>
                  <th>{t(lang, 'status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className={m.isActive ? '' : 'archived'}>
                    <td data-label={t(lang, 'nickname')}>
                      <strong>{m.nickname}</strong>
                      {m.id === me.id && <span className="you"> ({t(lang, 'you')})</span>}
                      {m.fullName && <small className="block muted">{m.fullName}</small>}
                    </td>
                    <td data-label="Gmail" className="mono">
                      {m.email ?? <span className="muted">–</span>}
                    </td>
                    <td data-label={t(lang, 'position')}>{t(lang, posLabel(m.position))}</td>
                    <td data-label={t(lang, 'employment')}>{t(lang, empLabel(m.employment))}</td>
                    <td data-label={t(lang, 'appRole')}>
                      <span className={`pill role-${m.role}`}>{t(lang, roleLabel[m.role])}</span>
                    </td>
                    <td data-label={t(lang, 'status')}>
                      <span className={`pill ${m.isActive ? 'status-approved' : 'status-withdrawn'}`}>
                        {t(lang, m.isActive ? 'memberActive' : 'memberArchived')}
                      </span>
                    </td>
                    <td className="num">
                      <button className="link" onClick={() => setEditing(m)}>
                        {t(lang, 'edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <MemberForm
          lang={lang}
          member={editing === 'new' ? undefined : editing}
          isSelf={editing !== 'new' && editing.id === me.id}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

const blank: MemberInput = { nickname: '', fullName: null, email: null, position: 'mc', employment: 'full_time', role: 'mc', isActive: true, startDate: null };

function MemberForm({
  lang,
  member,
  isSelf,
  onClose,
  onSaved,
}: {
  lang: Lang;
  member?: Member;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (m: Member, wasNew: boolean, emailChanged: boolean) => void;
}) {
  const [form, setForm] = useState<MemberInput>(member ?? blank);
  const [error, setError] = useState<{ text: string; field?: string }>();
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const needsEmail = form.role !== 'viewer';
  const canSave = form.nickname.trim() !== '' && (!needsEmail || Boolean(form.email?.trim()));

  async function save(input: MemberInput) {
    setBusy(true);
    setError(undefined);
    try {
      const out = await api.saveMember(input, member?.id);
      if (out.ok) {
        onSaved(out.member, !member, (member?.email ?? null) !== out.member.email);
        return;
      }
      const key = `err_${out.error}` as StringKey;
      const known = ['err_nickname_taken', 'err_email_taken', 'err_last_admin', 'err_cannot_demote_self'].includes(key);
      const text = known ? t(lang, key) : out.message?.startsWith('email is required') ? t(lang, 'err_email_required') : (out.message ?? out.error);
      setError({ text, field: out.field });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t(lang, member ? 'editMember' : 'newMember')}
      onClose={onClose}
      footer={
        <>
          {member && !isSelf && (
            <button className={member.isActive ? 'danger-outline' : ''} disabled={busy} onClick={() => void save({ ...form, isActive: !member.isActive })}>
              {t(lang, member.isActive ? 'archive' : 'restore')}
            </button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>{t(lang, 'cancelBtn')}</button>
          <button className="primary" disabled={!canSave || busy} onClick={() => void save(form)}>
            {t(lang, 'saveBtn')}
          </button>
        </>
      }
    >
      <div className="form-grid member-form">
        <label className={error?.field === 'nickname' ? 'has-error' : ''}>
          {t(lang, 'nickname')} *
          <input value={form.nickname} maxLength={40} onChange={(e) => set('nickname', e.target.value)} autoFocus={!member} />
          <small className="hint">{t(lang, 'nicknameHint')}</small>
        </label>
        <label>
          {t(lang, 'fullName')}
          <input value={form.fullName ?? ''} onChange={(e) => set('fullName', e.target.value || null)} />
        </label>
        <label className={`wide${error?.field === 'email' ? ' has-error' : ''}`}>
          {t(lang, 'gmail')}
          {needsEmail ? ' *' : ''}
          <input type="email" inputMode="email" autoComplete="off" placeholder="name@gmail.com" value={form.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
        </label>
        <label>
          {t(lang, 'position')}
          <select value={form.position} onChange={(e) => set('position', e.target.value as Member['position'])}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(lang, posLabel(p))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(lang, 'employment')}
          <select value={form.employment} onChange={(e) => set('employment', e.target.value as Member['employment'])}>
            {EMPLOYMENTS.map((x) => (
              <option key={x} value={x}>
                {t(lang, empLabel(x))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(lang, 'startDate')}
          <input type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
        </label>

        <fieldset className="wide role-picker" disabled={isSelf}>
          <legend>{t(lang, 'appRole')}</legend>
          {ROLES.map((r) => (
            <label key={r} className={`role-option${form.role === r ? ' selected' : ''}`}>
              <input type="radio" name="role" value={r} checked={form.role === r} onChange={() => set('role', r)} />
              <span>
                <strong>{t(lang, roleLabel[r])}</strong>
                <small>{t(lang, `roleDesc_${r}` as StringKey)}</small>
              </span>
            </label>
          ))}
          {isSelf && <p className="hint">{t(lang, 'err_cannot_demote_self')}</p>}
        </fieldset>
      </div>
      {error && <p className="error">{error.text}</p>}
    </Modal>
  );
}
