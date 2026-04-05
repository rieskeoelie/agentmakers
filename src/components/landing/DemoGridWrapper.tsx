'use client'
import { useEffect, useState } from 'react'
import { DemoForm } from './DemoForm'
import { OrbColumn } from './OrbColumn'
import { OrbPreview } from './OrbPreview'

interface Props {
  slug: string
  lang: string
  strings: Record<string, string>
  orbLabel: string
}

export function DemoGridWrapper({ slug, lang, strings, orbLabel }: Props) {
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const handler = () => setSubmitted(true)
    window.addEventListener('form:success', handler)
    return () => window.removeEventListener('form:success', handler)
  }, [])

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🎉</div>
        <h3 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', marginBottom: 16, fontSize: '1.6rem', fontWeight: 700 }}>
          {strings.success}
        </h3>
        <p style={{ color: '#CCFBF1', fontSize: '1.05rem', margin: 0 }}>{strings.success_sub}</p>
      </div>
    )
  }

  return (
    <div className="demo-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', maxWidth: 960, margin: '0 auto' }}>
      <div className="demo-section-form" style={{ textAlign: 'center' }}>
        <DemoForm slug={slug} lang={lang as 'nl' | 'en' | 'es'} strings={strings} suppressSuccess />
      </div>
      <OrbColumn>
        <div className="demo-section-orb" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <OrbPreview />
          <p style={{ color: '#fff', fontSize: '0.78rem', textAlign: 'center', maxWidth: 240, lineHeight: 1.6, margin: 0 }}>
            {orbLabel}
          </p>
        </div>
      </OrbColumn>
    </div>
  )
}
