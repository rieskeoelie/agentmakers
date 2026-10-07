'use client'
import { useState } from 'react'
import { Button, Callout, Field, Input } from '../ds'
import { copyFor } from './copy'
import type { CurrentUser } from './model'

type Screen = 'login' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-done'

/** Sign-in + password reset (same endpoints and behaviour as before). */
export function Login({ onLoggedIn, resetToken }: { onLoggedIn: (u: CurrentUser) => void; resetToken: string | null }) {
  const lang = typeof localStorage !== 'undefined' && localStorage.getItem('agentmakers_ui_lang') === 'es' ? 'es' : 'nl'
  const t = copyFor(lang)
  const [screen, setScreen] = useState<Screen>(resetToken ? 'reset' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [resetUser, setResetUser] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const login = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Inloggen mislukt'); return }
      onLoggedIn({ userId: data.user.userId, displayName: data.user.displayName, isAdmin: data.user.isAdmin, isSuperAdmin: data.user.isSuperAdmin ?? false })
    } catch { setError(t('networkError')) } finally { setBusy(false) }
  }
  const sendReset = async () => {
    if (!resetUser.trim()) { setError(t('loginUser')); return }
    setBusy(true); setError('')
    try {
      await fetch('/api/auth/reset-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: resetUser.trim() }) })
      setScreen('forgot-sent')
    } finally { setBusy(false) }
  }
  const confirmReset = async () => {
    if (!pw1 || pw1.length < 8) { setError(t('passwordHelp')); return }
    if (pw1 !== pw2) { setError('Wachtwoorden komen niet overeen'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth/reset-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: pw1 }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Mislukt'); return }
      setScreen('reset-done')
    } finally { setBusy(false) }
  }

  return (
    <div className="am-login">
      <div className="am-login-card" data-testid="login">
        <div className="am-inline" style={{ marginBottom: 24 }}>
          <span className="am-brand-mark">am</span>
          <span className="am-brand-name">agentmakers <span>{t('loginSubtitle')}</span></span>
        </div>
        {screen === 'login' && (
          <form className="am-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void login() }}>
            <Field label={t('loginUser')} htmlFor="am-user"><Input id="am-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus /></Field>
            <Field label={t('loginPassword')} htmlFor="am-pw"><Input id="am-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
            {error && <Callout tone="danger">{error}</Callout>}
            <Button type="submit" variant="primary" loading={busy}>{t('loginButton')}</Button>
            <button type="button" className="am-link-btn" style={{ alignSelf: 'center', fontSize: 12.5 }} onClick={() => { setError(''); setScreen('forgot') }}>{t('loginForgot')}</button>
          </form>
        )}
        {screen === 'forgot' && (
          <form className="am-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void sendReset() }}>
            <p className="am-muted">{t('forgotText')}</p>
            <Field label={t('loginUser')} htmlFor="am-reset-user"><Input id="am-reset-user" value={resetUser} onChange={(e) => setResetUser(e.target.value)} autoFocus /></Field>
            {error && <Callout tone="danger">{error}</Callout>}
            <Button type="submit" variant="primary" loading={busy}>{t('forgotSend')}</Button>
            <button type="button" className="am-link-btn" style={{ alignSelf: 'center', fontSize: 12.5 }} onClick={() => setScreen('login')}>{t('backToLogin')}</button>
          </form>
        )}
        {screen === 'forgot-sent' && (
          <div className="am-stack" style={{ gap: 16 }}>
            <Callout tone="success">{t('forgotSent')}</Callout>
            <Button onClick={() => setScreen('login')}>{t('backToLogin')}</Button>
          </div>
        )}
        {screen === 'reset' && (
          <form className="am-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); void confirmReset() }}>
            <p className="am-muted">{t('resetText')}</p>
            <Field label={t('resetNew')} htmlFor="am-pw1"><Input id="am-pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" /></Field>
            <Field label={t('resetConfirm')} htmlFor="am-pw2"><Input id="am-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
            {error && <Callout tone="danger">{error}</Callout>}
            <Button type="submit" variant="primary" loading={busy}>{t('resetButton')}</Button>
          </form>
        )}
        {screen === 'reset-done' && (
          <div className="am-stack" style={{ gap: 16 }}>
            <Callout tone="success">{t('resetDone')}</Callout>
            <Button variant="primary" onClick={() => setScreen('login')}>{t('backToLogin')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
