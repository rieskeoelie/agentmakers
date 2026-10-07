'use client'
import { useState } from 'react'
import { Button, Callout, Dialog, ExtLink, Field, Input, Segmented } from '../ds'
import { useAdmin } from '../app/AdminContext'

type DemoLang = 'nl' | 'en' | 'es'
const PLACEHOLDER: Record<DemoLang, { name: string; company: string; email: string; site: string }> = {
  nl: { name: 'Jan de Vries', company: 'Loodgieter Jansen BV', email: 'jan@bedrijf.nl', site: 'https://bedrijf.nl' },
  en: { name: 'John Smith', company: 'Smith Plumbing Ltd', email: 'john@company.co.uk', site: 'https://company.co.uk' },
  es: { name: 'Carlos García', company: 'Fontanero García SL', email: 'carlos@empresa.es', site: 'https://empresa.es' },
}

/** Personal demo invitation (POST /api/invite) — unchanged behaviour, new UI. */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, viewAs, refreshCrm } = useAdmin()
  const [demoLang, setDemoLang] = useState<DemoLang>(lang === 'es' ? 'es' : 'nl')
  const [v, setV] = useState({ naam: '', bedrijf: '', email: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ demo_url: string; naam: string } | null>(null)
  const reset = () => { setV({ naam: '', bedrijf: '', email: '', website: '' }); setResult(null); setError('') }
  const close = () => { onClose(); reset() }

  const send = async () => {
    if (!v.naam || !v.email || !v.website) { setError(t('inviteRequired')); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: v.naam, bedrijfsnaam: v.bedrijf, email: v.email, website: v.website, language: demoLang, view_as_user_id: viewAs?.id ?? null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Versturen mislukt'); return }
      setResult({ demo_url: data.demo_url, naam: v.naam })
      void refreshCrm()
    } catch { setError(t('networkError')) } finally { setBusy(false) }
  }

  const ph = PLACEHOLDER[demoLang]
  return (
    <Dialog open={open} onClose={close} closeDisabled={busy} title={result ? t('inviteDone') : t('inviteTitle')} description={result ? undefined : t('inviteDesc')} testId="invite-dialog"
      footer={result
        ? <><Button variant="ghost" onClick={reset}>{t('inviteAnother')}</Button><Button variant="primary" onClick={close}>{t('close')}</Button></>
        : <><Button variant="ghost" onClick={close} disabled={busy}>{t('cancel')}</Button><Button variant="primary" icon="send" loading={busy} onClick={() => void send()}>{busy ? t('inviteSending') : t('inviteSend')}</Button></>}>
      {result ? (
        <div className="am-stack" style={{ gap: 12 }}>
          <p><strong className="am-strong">{result.naam}</strong> {t('inviteDoneText')}</p>
          <Field label="Demo-link"><ExtLink href={result.demo_url}>{result.demo_url}</ExtLink></Field>
        </div>
      ) : (
        <form className="am-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void send() }}>
          <Field label={t('inviteLanguage')}>
            <Segmented label={t('inviteLanguage')} value={demoLang} onChange={setDemoLang} options={[{ value: 'nl', label: 'Nederlands' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} />
          </Field>
          <div className="am-form-grid">
            <Field label={t('inviteName')}><Input value={v.naam} placeholder={ph.name} onChange={(e) => setV({ ...v, naam: e.target.value })} /></Field>
            <Field label={t('inviteCompany')}><Input value={v.bedrijf} placeholder={ph.company} onChange={(e) => setV({ ...v, bedrijf: e.target.value })} /></Field>
            <Field label={t('inviteEmail')}><Input type="email" value={v.email} placeholder={ph.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
            <Field label={t('inviteWebsite')}><Input type="url" value={v.website} placeholder={ph.site} onChange={(e) => setV({ ...v, website: e.target.value })} /></Field>
          </div>
          {error && <Callout tone="danger">{error}</Callout>}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}
