'use client'
import { useEffect, useState } from 'react'

const PHRASES = [
  'Goedemiddag, waarmee kan ik u helpen?',
  'Ik boek dat direct voor u in…',
  'Een moment, ik kijk even in de agenda…',
  'Donderdag om 10 uur past prima!',
  'U ontvangt een bevestiging per e-mail.',
]

export function OrbPreview() {
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const cycle = () => {
      setVisible(false)
      setTimeout(() => {
        setPhraseIdx(i => (i + 1) % PHRASES.length)
        setVisible(true)
      }, 500)
    }
    const id = setInterval(cycle, 3200)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      gap: 24,
    }}>
      {/* Orb */}
      <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Pulse rings */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute',
            width: 160, height: 160,
            borderRadius: '50%',
            border: `1.5px solid rgba(45,212,191,${0.4 - i * 0.12})`,
            animation: `orbRingPrev 2.4s ease-out ${i * 0.6}s infinite`,
            pointerEvents: 'none',
          }} />
        ))}
        {/* Glow */}
        <div style={{
          position: 'absolute',
          width: 160, height: 160,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(45,212,191,0.22) 0%, transparent 70%)',
          filter: 'blur(18px)',
          animation: 'glowPulse 2.4s ease-in-out infinite',
        }} />
        {/* Surface */}
        <div style={{
          width: 120, height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 35% 30%, #1A7A72 0%, #0D5A52 35%, #072E2A 100%)',
          boxShadow: `
            inset 0 1.5px 0 rgba(255,255,255,0.22),
            inset 0 -1px 0 rgba(0,0,0,0.4),
            0 0 0 1px rgba(45,212,191,0.35),
            0 0 40px rgba(45,212,191,0.35),
            0 20px 50px rgba(0,0,0,0.4)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Specular */}
          <div style={{
            position: 'absolute',
            top: 10, left: '50%',
            transform: 'translateX(-50%)',
            width: 48, height: 18,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.18) 0%, transparent 80%)',
            borderRadius: '50%',
          }} />
          <span style={{ fontSize: '2rem', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>🔊</span>
        </div>
      </div>

      {/* Sound bars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28 }}>
        {[0.5, 0.85, 1.1, 1.4, 1.0, 1.3, 0.75, 1.1, 0.6].map((amp, i) => (
          <div key={i} style={{
            width: 3,
            borderRadius: 4,
            background: 'linear-gradient(to top, #0D9488, #5EEAD4)',
            animation: `soundBarPrev ${0.6 + i * 0.07}s ease-in-out infinite alternate`,
            height: `${8 + amp * 12}px`,
            boxShadow: '0 0 4px rgba(45,212,191,0.4)',
          }} />
        ))}
      </div>

      {/* Rotating phrase */}
      <div style={{
        maxWidth: 260,
        textAlign: 'center',
        minHeight: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{
          color: 'rgba(240,244,248,0.75)',
          fontSize: '0.9rem',
          lineHeight: 1.55,
          fontStyle: 'italic',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s ease',
          margin: 0,
        }}>
          &ldquo;{PHRASES[phraseIdx]}&rdquo;
        </p>
      </div>

      {/* Status chip */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'rgba(45,212,191,0.1)',
        border: '1px solid rgba(45,212,191,0.25)',
        borderRadius: 100,
        padding: '6px 14px',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#2DD4BF',
      }}>
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#2DD4BF',
          animation: 'dotPulsePrev 2s ease-in-out infinite',
          display: 'inline-block',
        }} />
        Spreekt
      </div>

      <style>{`
        @keyframes orbRingPrev {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(1.7);  opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.12); }
        }
        @keyframes soundBarPrev {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.6); }
        }
        @keyframes dotPulsePrev {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  )
}
