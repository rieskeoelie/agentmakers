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
  const monthly = Math.round(annual / 12)

  const l = {
    nl: {
      label: 'DE IMPACT',
      title: 'Zie de omzet die u misloopt',
      callsLabel: 'Gemiste boekingen / week',
      valueLabel: 'Gem. orderwaarde',
      perYear: 'gemiste omzet per jaar',
      perMonth: (m: string) => `≈ €${m} per maand`,
      context: (c: number, v: number) =>
        c <= 3
          ? `Zelfs bij ${c} gemiste afspraken per week loopt dat snel op.`
          : c <= 10
          ? `Bij ${c} gemiste afspraken per week is dit een serieus lek in uw omzet.`
          : `${c} gemiste afspraken per week — dat is structureel omzetverlies.`,
      cta: 'Bereken uw situatie gratis →',
    },
    en: {
      label: 'THE IMPACT',
      title: 'How much revenue are you missing?',
      callsLabel: 'Missed bookings / week',
      valueLabel: 'Avg. order value',
      perYear: 'missed revenue per year',
      perMonth: (m: string) => `≈ €${m} per month`,
      context: (c: number) =>
        c <= 3
          ? `Even ${c} missed appointments per week adds up fast.`
          : c <= 10
          ? `${c} missed bookings a week is a serious revenue leak.`
          : `${c} missed appointments weekly — that's structural revenue loss.`,
      cta: 'Calculate your situation for free →',
    },
    es: {
      label: 'EL IMPACTO',
      title: '¿Cuántos ingresos está perdiendo?',
      callsLabel: 'Reservas perdidas / semana',
      valueLabel: 'Valor medio del pedido',
      perYear: 'ingresos perdidos al año',
      perMonth: (m: string) => `≈ €${m} al mes`,
      context: (c: number) =>
        c <= 3
          ? `Incluso ${c} citas perdidas a la semana se acumula rápido.`
          : `${c} reservas perdidas semanales es una fuga de ingresos seria.`,
      cta: 'Calcule su situación gratis →',
    },
  }

  const s = l[lang] || l.nl

  return (
    <section style={{ padding: '72px 0', background: '#F8FAFC' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ color: '#0D9488', fontWeight: 700, fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {s.label}
          </div>
          <h2 style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(1.3rem, 2.5vw, 1.8rem)', color: '#0F172A', margin: 0 }}>
            {s.title}
          </h2>
        </div>

        {/* Card */}
        <div style={{ background: '#0F172A', borderRadius: 16, padding: '36px 40px' }}>

          {/* Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 32 }}>
            {/* Slider 1 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ color: '#fff', fontSize: '.95rem', fontWeight: 600, letterSpacing: '.02em' }}>{s.callsLabel}</label>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', fontWeight: 700, color: '#CCFBF1', minWidth: 32, textAlign: 'right' }}>{calls}</span>
              </div>
              <input type="range" min={1} max={30} step={1} value={calls}
                onChange={e => setCalls(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#0D9488', cursor: 'pointer', height: 4 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: '.7rem', marginTop: 3 }}>
                <span>1</span><span>30</span>
              </div>
            </div>

            {/* Slider 2 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ color: '#fff', fontSize: '.95rem', fontWeight: 600, letterSpacing: '.02em' }}>{s.valueLabel}</label>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: '1.3rem', fontWeight: 700, color: '#CCFBF1', minWidth: 60, textAlign: 'right' }}>€{value}</span>
              </div>
              <input type="range" min={50} max={2000} step={25} value={value}
                onChange={e => setValue(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#0D9488', cursor: 'pointer', height: 4 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: '.7rem', marginTop: 3 }}>
                <span>€50</span><span>€2.000</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', marginBottom: 24 }} />

          {/* Result row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            {/* Context text */}
            <p style={{ color: '#fff', fontSize: '.85rem', maxWidth: 300, margin: 0, lineHeight: 1.5 }}>
              {s.context(calls, value)}
            </p>

            {/* Amount */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-.02em' }}>
                €{annual.toLocaleString('nl-NL')}
              </div>
              <div style={{ color: '#fff', fontSize: '.95rem', marginTop: 4 }}>
                {s.perYear}
              </div>
              <div style={{ color: '#CCFBF1', fontSize: '1rem', fontWeight: 600, marginTop: 2 }}>
                {s.perMonth(monthly.toLocaleString('nl-NL'))}
              </div>
            </div>
          </div>

          {/* CTA nudge */}
          <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 20, textAlign: 'center' }}>
            <a href="#demo" style={{ color: '#0D9488', fontWeight: 700, fontSize: '.85rem', textDecoration: 'none', letterSpacing: '.01em' }}>
              {s.cta}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
