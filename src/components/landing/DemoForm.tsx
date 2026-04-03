'use client'
import { useState } from 'react'
import type { Lang } from '@/lib/i18n'

interface Props {
  slug: string
  lang: Lang
  strings: Record<string, string>
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

  const inputStyle = {
    width: '100%', padding: '14px 18px', borderRadius: 10, boxSizing: 'border-box' as const,
    border: '1.5px solid rgba(255,255,255,.3)', background: '#fff',
    color: '#0F172A', fontSize: '.95rem', fontFamily: "'Nunito', sans-serif",
    outline: 'none',
  }

  if (state === 'success') {
    return (
      <div style={{ background: 'rgba(255,255,255,.15)', padding: '40px', borderRadius: 16, maxWidth: 480, margin: '0 auto', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
        <h3 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', marginBottom: 8, fontSize: '1.3rem' }}>{strings.success}</h3>
        <p style={{ color: '#CCFBF1' }}>{strings.trust}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input required name="naam" value={form.naam} onChange={handleChange} placeholder={strings.name} style={inputStyle} />
      <input required type="email" name="email" value={form.email} onChange={handleChange} placeholder={strings.email} style={inputStyle} />
      <input required type="tel" name="telefoon" value={form.telefoon} onChange={handleChange} placeholder={strings.phone} style={inputStyle} />
      <input type="url" name="website" value={form.website} onChange={handleChange} placeholder={strings.website} style={inputStyle} />
      <input name="bedrijfsnaam" value={form.bedrijfsnaam} onChange={handleChange} placeholder={strings.company} style={inputStyle} />
      <button type="submit" disabled={state === 'sending'} style={{ background: '#fff', color: '#0F766E', padding: '16px 32px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginTop: 4 }}>
        {state === 'sending' ? strings.sending : state === 'error' ? strings.error : strings.submit}
      </button>
      <p style={{ color: '#CCFBF1', fontSize: '.8rem', marginTop: 8, textAlign: 'center' }}>{strings.trust}</p>
    </form>
  )
}
