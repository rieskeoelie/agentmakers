'use client'
import { useState } from 'react'
import { DemoForm, Confetti } from './DemoForm'
import { OrbColumn } from './OrbColumn'
import { OrbPreview } from './OrbPreview'

interface Props {
  slug: string
  lang: string
  strings: Record<string, string>
  badge: string
  headline: string
  sub: string
  orbLabel: string
}

export function DemoSection({ slug, lang, strings, badge, headline, sub, orbLabel }: Props) {
  const [submitted, setSubmitted] = useState(false)

  return (
    <>
      {/* Header — hidden after submit */}
      {!submitted && (
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
      )}

      {/* Success state — full width centered */}
      {submitted ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', width: '100%' }}>
          <Confetti />
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🎉</div>
          <h3 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', marginBottom: 16, fontSize: '1.6rem', fontWeight: 700 }}>
            {strings.success}
          </h3>
          <p style={{ color: '#CCFBF1', fontSize: '1.05rem', margin: 0 }}>{strings.success_sub}</p>
        </div>
      ) : (
        /* Two-column grid */
        <div className="demo-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', maxWidth: 960, margin: '0 auto' }}>
          <div className="demo-section-form" style={{ textAlign: 'center' }}>
            <DemoForm
              slug={slug}
              lang={lang as 'nl' | 'en' | 'es'}
              strings={strings}
              suppressSuccess
              onSuccess={() => setSubmitted(true)}
            />
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
      )}
    </>
  )
}
