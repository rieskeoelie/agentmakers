'use client'
import { useState } from 'react'
import type { Lang } from '@/lib/i18n'

interface Props {
  slug: string
  lang: Lang
  strings: Record<string, string>
}

const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconMail = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
)
const IconPhone = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.87a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>
  </svg>
)
const IconGlobe = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)
const IconBuilding = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
  </svg>
)

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        {icon}
      </div>
      {children}
    </div>
  )
}

export function DemoForm({ slug, lang, strings }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [form, setForm] = useState({ naam: '', email: '', telefoon: '', website: '', bedrijfsnaam: '' })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, slug, language: lang }),
      })
      if (!res.ok) throw new Error('Failed')
      setState('success')
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 18px 14px 46px',
    borderRadius: 10,
    boxSizing: 'border-box',
    border: '1.5px solid #E2E8F0',
    background: '#F8FAFC',
    color: '#0F172A',
    fontSize: '.95rem',
    fontFamily: "'Nunito', sans-serif",
    outline: 'none',
  }

  if (state === 'success') {
    return (
      <div style={{ background: '#fff', padding: '48px 40px', borderRadius: 20, maxWidth: 520, margin: '0 auto', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,.12)' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
        <h3 style={{ fontFamily: "'Poppins',sans-serif", color: '#0F172A', marginBottom: 8, fontSize: '1.3rem' }}>{strings.success}</h3>
        <p style={{ color: '#64748B' }}>{strings.trust}</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '40px', maxWidth: 520, margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,.12)' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field icon={<IconUser />}>
          <input required name="naam" value={form.naam} onChange={handleChange} placeholder={strings.name} style={inputStyle} />
        </Field>
        <Field icon={<IconMail />}>
          <input required type="email" name="email" value={form.email} onChange={handleChange} placeholder={strings.email} style={inputStyle} />
        </Field>
        <Field icon={<IconPhone />}>
          <input required type="tel" name="telefoon" value={form.telefoon} onChange={handleChange} placeholder={strings.phone} style={inputStyle} />
        </Field>
        <Field icon={<IconGlobe />}>
          <input type="url" name="website" value={form.website} onChange={handleChange} placeholder={strings.website} style={inputStyle} />
        </Field>
        <Field icon={<IconBuilding />}>
          <input name="bedrijfsnaam" value={form.bedrijfsnaam} onChange={handleChange} placeholder={strings.company} style={inputStyle} />
        </Field>
        <button
          type="submit"
          disabled={state === 'sending'}
          style={{ background: '#0D9488', color: '#fff', padding: '16px 32px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '1rem', cursor: state === 'sending' ? 'wait' : 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 4 }}
        >
          {state === 'sending' ? strings.sending : state === 'error' ? strings.error : strings.submit}
        </button>
        <p style={{ color: '#94A3B8', fontSize: '.8rem', textAlign: 'center', margin: 0 }}>{strings.trust}</p>
      </form>
    </div>
  )
}
