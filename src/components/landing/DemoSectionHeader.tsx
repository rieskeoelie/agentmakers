'use client'
import { useEffect, useState } from 'react'

interface Props {
  badge: string
  headline: string
  sub: string
}

export function DemoSectionHeader({ badge, headline, sub }: Props) {
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const handler = () => setSubmitted(true)
    window.addEventListener('form:success', handler)
    return () => window.removeEventListener('form:success', handler)
  }, [])

  if (submitted) return null

  return (
    <div style={{ textAlign: 'center', marginBottom: 48 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 100, padding: '6px 16px', marginBottom: 20 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DD4BF', display: 'inline-block', animation: 'dotPulseLP 2s ease-in-out infinite' }} />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2DD4BF' }}>
          {badge}
        </span>
      </div>
      <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 20, maxWidth: 700, marginLeft: 'auto', marginRight: 'auto' }}>
        {headline}
      </h2>
      <p style={{ color: '#fff', fontSize: '1rem', maxWidth: 620, margin: '0 auto', lineHeight: 1.75 }}>
        {sub}
      </p>
    </div>
  )
}
