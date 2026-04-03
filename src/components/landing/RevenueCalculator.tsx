'use client'
import { useState } from 'react'
import type { Lang } from '@/lib/i18n'

interface Props {
  lang: Lang
  defaultCalls?: number
  defaultValue?: number
}

export function RevenueCalculator({ lang, defaultCalls = 5, defaultValue = 500 }: Props) {
  const [calls, setCalls] = useState(defaultCalls)
  const [value, setValue] = useState(defaultValue)

  const annual = calls * value * 52

  const labels = {
    nl: {
      impact: 'De impact',
      title: 'Hoeveel omzet loopt u mis?',
      sub: 'Pas de schuifjes aan op uw situatie.',
      callsLabel: 'Gemiste boekingen per week',
      valueLabel: 'Gemiddelde orderwaarde',
      weeks: 'weken per jaar',
      missedRevenue: 'gemiste omzet per jaar',
      perWeek: 'gemiste boekingen/week',
      avgValue: 'gem. orderwaarde',
    },
    en: {
      impact: 'The impact',
      title: 'How much revenue are you missing?',
      sub: 'Adjust the sliders to your situation.',
      callsLabel: 'Missed bookings per week',
      valueLabel: 'Average order value',
      weeks: 'weeks per year',
      missedRevenue: 'missed revenue per year',
      perWeek: 'missed bookings/week',
      avgValue: 'avg. order value',
    },
    es: {
      impact: 'El impacto',
      title: '¿Cuántos ingresos está perdiendo?',
      sub: 'Ajuste los deslizadores a su situación.',
      callsLabel: 'Reservas perdidas por semana',
      valueLabel: 'Valor medio del pedido',
      weeks: 'semanas al año',
      missedRevenue: 'ingresos perdidos al año',
      perWeek: 'reservas perdidas/sem.',
      avgValue: 'valor medio',
    },
  }

  const s = labels[lang] || labels.nl

  return (
    <section style={{ padding: '100px 0' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #0F172A, #1a2d42)',
          borderRadius: 20, padding: '56px',
          color: '#fff', textAlign: 'center',
          maxWidth: 800, margin: '0 auto',
        }}>
          {/* Label */}
          <div style={{ color: '#CCFBF1', fontWeight: 600, fontSize: '.75rem', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            {s.impact}
          </div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", color: '#fff', marginBottom: 12, fontSize: 'clamp(1.4rem, 2.8vw, 2rem)' }}>
            {s.title}
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '1rem', marginBottom: 48 }}>
            {s.sub}
          </p>

          {/* Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36, marginBottom: 48, textAlign: 'left' }}>
            {/* Slider 1 - missed bookings */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <label style={{ color: '#CBD5E1', fontSize: '.9rem', fontWeight: 600 }}>{s.callsLabel}</label>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#CCFBF1' }}>{calls}</span>
              </div>
              <input
                type="range"
                min={1} max={30} step={1}
                value={calls}
                onChange={e => setCalls(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#0D9488', height: 6, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: '.75rem', marginTop: 4 }}>
                <span>1</span><span>30</span>
              </div>
            </div>

            {/* Slider 2 - avg order value */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <label style={{ color: '#CBD5E1', fontSize: '.9rem', fontWeight: 600 }}>{s.valueLabel}</label>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#CCFBF1' }}>€{value}</span>
              </div>
              <input
                type="range"
                min={50} max={2000} step={25}
                value={value}
                onChange={e => setValue(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#0D9488', height: 6, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: '.75rem', marginTop: 4 }}>
                <span>€50</span><span>€2.000</span>
              </div>
            </div>
          </div>

          {/* Equation */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 32 }}>
            {[
              [calls, s.perWeek],
              [`€${value}`, s.avgValue],
              [52, s.weeks],
            ].map(([num, desc], i) => (
              <>
                <div key={i} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 14, padding: '20px 28px', minWidth: 130, transition: 'all .2s' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#CCFBF1', fontFamily: "'Nunito',sans-serif" }}>{num}</div>
                  <div style={{ fontSize: '.8rem', color: '#94A3B8', marginTop: 6 }}>{desc}</div>
                </div>
                {i < 2 && (
                  <div key={`x${i}`} style={{ color: '#475569', fontSize: '1.4rem', fontWeight: 300 }}>×</div>
                )}
              </>
            ))}
          </div>

          {/* Result */}
          <div style={{
            background: '#0D9488',
            padding: '28px 48px', borderRadius: 14,
            display: 'inline-block',
            transition: 'all .3s',
            boxShadow: '0 8px 32px rgba(13,148,136,.35)',
          }}>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: '#fff', fontFamily: "'Poppins',sans-serif", letterSpacing: '-.02em' }}>
              €{annual.toLocaleString('nl-NL')}
            </div>
            <div style={{ fontSize: '.9rem', color: '#CCFBF1', marginTop: 6 }}>{s.missedRevenue}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
