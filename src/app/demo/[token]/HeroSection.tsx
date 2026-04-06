'use client'
import { useEffect, useState, useRef } from 'react'

interface Props {
  eyebrow: string
  headline: string
  companyName: string
  sub: string
}

export function HeroSection({ eyebrow, headline, companyName, sub }: Props) {
  const [hidden, setHidden] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [fontSize, setFontSize] = useState(2.0) // rem

  // Auto-shrink: reduce font size until company name fits on one line
  useEffect(() => {
    const el = textRef.current
    const box = containerRef.current
    if (!el || !box) return

    let size = 2.0
    el.style.fontSize = `${size}rem`

    // Step down until it fits, min 0.9rem
    while (el.scrollWidth > box.clientWidth && size > 0.9) {
      size = Math.round((size - 0.05) * 100) / 100
      el.style.fontSize = `${size}rem`
    }
    setFontSize(size)
  }, [companyName])

  useEffect(() => {
    const hide = () => setHidden(true)
    window.addEventListener('demo:ended', hide)
    return () => window.removeEventListener('demo:ended', hide)
  }, [])

  if (hidden) return null

  return (
    <div className="hero">
      <div className="eyebrow">
        <span className="eyebrow-dot" />
        {eyebrow}
      </div>

      {/* "AI receptioniste voor" — smaller, lighter */}
      <p style={{
        fontFamily: "'Poppins', sans-serif",
        fontWeight: 500,
        fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
        color: 'rgba(240,244,248,0.55)',
        letterSpacing: '-0.01em',
        marginBottom: 16,
        marginTop: 0,
      }}>
        {headline}
      </p>

      {/* Company name — luxury framed */}
      <div
        ref={containerRef}
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          width: '100%',
          marginBottom: 22,
          padding: '2px',
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(45,212,191,0.5) 0%, rgba(99,102,241,0.4) 50%, rgba(45,212,191,0.3) 100%)',
          boxShadow: '0 0 40px rgba(45,212,191,0.12), 0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{
          background: 'linear-gradient(135deg, rgba(7,16,30,0.97) 0%, rgba(15,25,50,0.97) 100%)',
          borderRadius: 16,
          padding: 'clamp(14px, 3vw, 22px) clamp(20px, 5vw, 44px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <span
            ref={textRef}
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 800,
              fontSize: `${fontSize}rem`,
              letterSpacing: '-0.03em',
              whiteSpace: 'nowrap',
              background: 'linear-gradient(135deg, #ffffff 0%, #ffffff 45%, #7EEEDE 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              display: 'block',
              lineHeight: 1.15,
            }}
          >
            {companyName}
          </span>
        </div>
      </div>

      <p className="hero-sub">{sub}</p>
    </div>
  )
}
