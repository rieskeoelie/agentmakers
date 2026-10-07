'use client'
import { useEffect, useState } from 'react'
import { Avatar, Button, Callout, DataTable, Dialog, EmptyState, Field, Input, Menu, Metrics, Page, PageHeader, Status, TableSkeleton, useConfirm, type Column } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { shortDate, type AccountStat } from '../app/model'

/** Partner accounts (superadmin). Account administration is separate from the CRM. */
export function TeamScreen() {
  const a = useAdmin()
  const { t } = a
  const [createOpen, setCreateOpen] = useState(false)
  const [pwTarget, setPwTarget] = useState<AccountStat | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { a.loadAccounts() }, [a.loadAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const partners = a.accounts.filter((x) => !x.isSuperAdmin).sort((x, y) => y.leadsThisMonth - x.leadsThisMonth || y.leadsTotal - x.leadsTotal)
  const viewAs = (acc: AccountStat) => { a.setViewAs({ id: acc.id, name: acc.displayName }); a.navigate({ screen: 'leads' }) }
  const remove = async (acc: AccountStat) => {
    if (!(await confirm({ title: t('deleteAccount'), description: `${acc.displayName} ${t('deleteAccountText')}`, confirmLabel: t('delete') }))) return
    setError(null)
    const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: acc.id }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Verwijderen mislukt'); else a.loadAccounts()
  }

  const columns: Array<Column<AccountStat>> = [
    { key: 'acc', header: t('account'), sort: (x) => x.displayName.toLowerCase(), render: (x) => (
      <div className="am-inline" style={{ flexWrap: 'nowrap', gap: 10 }}><Avatar name={x.displayName} size="md" /><div><span className="am-cell-primary">{x.displayName}</span><span className="am-cell-secondary">@{x.username}</span></div></div>) },
    { key: 'role', header: t('role'), render: (x) => <Status tone={x.isAdmin ? 'info' : 'neutral'} dot={false}>{x.isAdmin ? t('roleAdmin') : t('rolePartner')}</Status>, nowrap: true },
    { key: 'leads', header: t('leadsTotal'), align: 'right', sort: (x) => x.leadsTotal, render: (x) => <span className="am-num">{x.leadsTotal}</span> },
    { key: 'month', header: t('thisMonth'), align: 'right', sort: (x) => x.leadsThisMonth, render: (x) => <span className="am-num" style={{ color: x.leadsThisMonth ? 'var(--am-green)' : undefined }}>{x.leadsThisMonth ? `+${x.leadsThisMonth}` : 0}</span> },
    { key: 'demos', hide: 'sm', header: t('demos'), align: 'right', sort: (x) => x.demosGenerated, render: (x) => <span className="am-num">{x.demosGenerated}</span> },
    { key: 'conv', hide: 'sm', header: t('conversations'), align: 'right', sort: (x) => x.conversations, render: (x) => <span className="am-num">{x.conversations}</span> },
    { key: 'active', header: t('lastActive'), sort: (x) => x.lastActiveAt ?? '', nowrap: true, render: (x) => <span className="am-muted">{x.lastActiveAt ? shortDate(x.lastActiveAt) : t('notActive')}</span> },
    { key: 'act', header: '', shrink: true, render: (x) => (
      <div className="am-inline" style={{ flexWrap: 'nowrap', gap: 4 }}>
        <Button size="sm" variant="ghost" icon="eye" onClick={() => viewAs(x)}>{t('viewAs')}</Button>
        <Menu items={[
          { label: t('setPassword'), icon: 'key', onSelect: () => setPwTarget(x) },
          { label: t('deleteAccount'), icon: 'trash', tone: 'danger', separatorBefore: true, onSelect: () => void remove(x) },
        ]} />
      </div>) },
  ]

  return (
    <Page>
      <PageHeader title={t('teamTitle')} subtitle={t('teamSubtitle')} actions={<>
        <Button icon="refresh" loading={a.accountsLoading} onClick={a.loadAccounts}>{t('refresh')}</Button>
        <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>{t('newAccount')}</Button>
      </>} />
      {partners.length > 0 && (
        <Metrics testId="team-metrics" items={[
          { label: t('partners'), value: partners.length },
          { label: `${t('leadsTotal')} · ${t('thisMonth').toLowerCase()}`, value: partners.reduce((s, x) => s + x.leadsThisMonth, 0) },
          { label: t('demos'), value: partners.reduce((s, x) => s + x.demosGenerated, 0) },
          { label: t('conversations'), value: partners.reduce((s, x) => s + x.conversations, 0) },
        ]} />
      )}
      <div style={{ height: 16 }} />
      {error && <div style={{ marginBottom: 12 }}><Callout tone="danger">{error}</Callout></div>}
      {a.accountsLoading && !a.accounts.length && <TableSkeleton cols={7} rows={4} />}
      {!a.accountsLoading && partners.length === 0 && <EmptyState icon="team" title={t('teamEmptyTitle')} text={t('teamEmptyText')} action={<Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>{t('newAccount')}</Button>} />}
      {partners.length > 0 && <DataTable testId="team-table" rows={partners} columns={columns} rowKey={(x) => x.id} minWidth={720} />}
      <CreateAccountDialog open={createOpen} onClose={() => { setCreateOpen(false); a.loadAccounts() }} />
      <SetPasswordDialog target={pwTarget} onClose={() => setPwTarget(null)} />
      {confirmDialog}
    </Page>
  )
}

function CreateAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAdmin()
  const [v, setV] = useState({ name: '', user: '', pw: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const reset = () => { setV({ name: '', user: '', pw: '' }); setError(''); setDone(null) }
  const create = async () => {
    if (!v.name.trim() || !v.user.trim() || !v.pw) { setError('Vul alle velden in.'); return }
    if (v.pw.length < 8) { setError(t('passwordHelp')); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: v.user.trim(), displayName: v.name.trim(), password: v.pw }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Aanmaken mislukt'); return }
      setDone(data.user.username)
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={() => { onClose(); reset() }} closeDisabled={busy} title={done ? t('accountCreated') : t('newAccount')}
      description={done ? undefined : 'De partner kan direct inloggen.'}
      footer={done
        ? <><Button variant="ghost" onClick={reset}>{t('newAccount')}</Button><Button variant="primary" onClick={() => { onClose(); reset() }}>{t('close')}</Button></>
        : <><Button variant="ghost" disabled={busy} onClick={() => { onClose(); reset() }}>{t('cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void create()}>{t('newAccount')}</Button></>}>
      {done ? <Callout tone="success" title={`@${done}`}>Deel de inloggegevens via een veilig kanaal. Het wachtwoord wordt niet opnieuw getoond.</Callout> : (
        <form className="am-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void create() }}>
          <Field label={t('displayName')}><Input value={v.name} autoFocus placeholder="Gerard de Boer" onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label={t('username')} help={t('usernameHelp')}><Input value={v.user} placeholder="gerard" onChange={(e) => setV({ ...v, user: e.target.value })} /></Field>
          <Field label={t('password')} help={t('passwordHelp')}><Input type="password" autoComplete="new-password" value={v.pw} onChange={(e) => setV({ ...v, pw: e.target.value })} /></Field>
          {error && <Callout tone="danger">{error}</Callout>}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}

function SetPasswordDialog({ target, onClose }: { target: AccountStat | null; onClose: () => void }) {
  const { t } = useAdmin()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const close = () => { setPw(''); setError(''); setDone(false); onClose() }
  const save = async () => {
    if (!target) return
    if (pw.length < 8) { setError(t('passwordHelp')); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth/set-password', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: target.id, password: pw }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Mislukt'); return }
      setDone(true)
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!target} onClose={close} closeDisabled={busy} title={t('setPassword')} description={target ? `${target.displayName} (@${target.username})` : undefined}
      footer={done ? <Button variant="primary" onClick={close}>{t('close')}</Button>
        : <><Button variant="ghost" disabled={busy} onClick={close}>{t('cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{t('setPassword')}</Button></>}>
      {done ? <Callout tone="success">{t('passwordSet')}</Callout> : (
        <form className="am-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void save() }}>
          <Field label={t('resetNew')} help={t('passwordHelp')}><Input type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {error && <Callout tone="danger">{error}</Callout>}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}
