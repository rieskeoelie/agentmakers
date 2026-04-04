'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { VoiceConversation } from '@elevenlabs/client'

interface Strings {
  start: string
  stop: string
  status_connecting: string
  status_talking: string
  status_listening: string
  status_ready: string
  scheduled_title: string
  scheduled_sub: string
}

interface Props {
  token: string
  strings: Strings
  companyName: string
  logoUrl: string | null
}

type Status = 'idle' | 'connecting' | 'listening' | 'talking' | 'error'

export function VoiceDemo({ token, strings, logoUrl }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [scheduledEmail, setScheduledEmail] = useState('')
  const [volume, setVolume] = useState(0)
  const [logoError, setLogoError] = useState(false)
  const convRef = useRef<VoiceConversation | null>(null)
  const rafRef = useRef<number | null>(null)

  // Volume polling
  useEffect(() => {
    const tick = () => {
      if (convRef.current) setVolume(convRef.current.getOutputVolume())
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const startCall = useCallback(async () => {
    setStatus('connecting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/signed-url?token=${token}`)
      if (!res.ok) throw new Error('Could not connect')
      const { agent_id, business_info } = await res.json()

      const conv = await VoiceConversation.startSession({
        agentId: agent_id,
        connectionType: 'websocket',
        dynamicVariables: { business_info: business_info || 'Geen informatie beschikbaar.' },
        clientTools: {
          collect_lead_info: async (params: { naam?: string; email?: string; telefoon?: string }) => {
            try {
              const r = await fetch('/api/demo-collect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...params }),
              })
              const data = await r.json()
              if (data.success) { setScheduled(true); setScheduledEmail(params.email || '') }
              return `Bedankt${params.naam ? ' ' + params.naam : ''}! Ik heb een persoonlijke meeting link gestuurd naar ${params.email}.`
            } catch {
              return 'Er is iets misgegaan. U kunt altijd een afspraak maken via agentmakers.io.'
            }
          },
        },
        onConnect: () => setStatus('listening'),
        onDisconnect: () => { setStatus('idle'); convRef.current = null },
        onError: (msg: string) => { setErrorMsg(msg); setStatus('error'); convRef.current = null },
        onModeChange: ({ mode }: { mode: string }) => {
          setStatus(mode === 'speaking' ? 'talking' : 'listening')
        },
      })
      convRef.current = conv
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verbinding mislukt.')
      setStatus('error')
    }
  }, [token])

  const stopCall = useCallback(async () => {
    if (convRef.current) { await convRef.current.endSession(); convRef.current = null }
    setStatus('idle')
  }, [])

  const isActive = status === 'connecting' || status === 'listening' || status === 'talking'
  const isTalking = status === 'talking'
  const isListening = status === 'listening'
  const isConnecting = status === 'connecting'

  const statusText = {
    idle: strings.status_ready,
    connecting: strings.status_connecting,
    listening: strings.status_listening,
    talking: strings.status_talking,
    error: errorMsg || 'Fout opgetreden.',
  }[status]

  // Dynamic glow radius based on volume
  const glowR = isActive ? (isTalking ? 55 + volume * 100 : 30) : 0
  const orbScale = isTalking ? 1 + volume * 0.055 : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

      {/* ── Orb ── */}
      <div
        onClick={isActive ? stopCall : startCall}
        style={{
          position: 'relative',
          width: 200, height: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isConnecting ? 'wait' : 'pointer',
          marginBottom: 20,
        }}
      >
        {/* Outer glow halo */}
        {isActive && (
          <div style={{
            position: 'absolute',
            width: 200, height: 200,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(${isTalking ? '45,212,191' : '20,184,166'},${isTalking ? 0.28 : 0.14}) 0%, transparent 70%)`,
            filter: `blur(${glowR * 0.7}px)`,
            transform: `scale(${orbScale})`,
            transition: 'filter 0.12s, transform 0.08s',
          }} />
        )}

        {/* Pulse rings */}
        {isActive && [
          { delay: '0s', opacity: isTalking ? 0.55 : 0.25 },
          { delay: '0.55s', opacity: isTalking ? 0.35 : 0.14 },
          { delay: '1.1s', opacity: isTalking ? 0.2 : 0.07 },
        ].map((r, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 200, height: 200,
            borderRadius: '50%',
            border: `1.5px solid rgba(45,212,191,${r.opacity})`,
            animation: `orbRing 2.2s ease-out ${r.delay} infinite`,
            pointerEvents: 'none',
          }} />
        ))}

        {/* Orb surface */}
        <div style={{
          width: 148, height: 148,
          borderRadius: '50%',
          position: 'relative',
          transform: `scale(${orbScale})`,
          transition: 'transform 0.08s',
          background: isActive
            ? 'radial-gradient(ellipse at 35% 30%, #1A7A72 0%, #0D5A52 35%, #072E2A 100%)'
            : 'radial-gradient(ellipse at 35% 30%, #152E36 0%, #0A1F28 50%, #060E18 100%)',
          boxShadow: isActive
            ? `
              inset 0 1.5px 0 rgba(255,255,255,0.22),
              inset 0 -1px 0 rgba(0,0,0,0.4),
              0 0 0 1px rgba(45,212,191,0.35),
              0 0 ${glowR}px rgba(45,212,191,0.45),
              0 20px 60px rgba(0,0,0,0.5)
            `
            : `
              inset 0 1px 0 rgba(255,255,255,0.1),
              inset 0 -1px 0 rgba(0,0,0,0.3),
              0 0 0 1px rgba(255,255,255,0.07),
              0 0 20px rgba(13,148,136,0.15),
              0 20px 50px rgba(0,0,0,0.4)
            `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 0,
          overflow: 'hidden',
        }}>
          {/* Specular highlight */}
          <div style={{
            position: 'absolute',
            top: 14, left: '50%',
            transform: 'translateX(-50%)',
            width: 60, height: 22,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.18) 0%, transparent 80%)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }} />

          {/* Content: logo or icon */}
          {!isActive && logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt=""
              width={52} height={52}
              style={{
                width: 52, height: 52,
                objectFit: 'contain',
                borderRadius: 10,
                opacity: 0.82,
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
              }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '2.4rem', lineHeight: 1, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>
                {isConnecting ? '⏳' : isTalking ? '🔊' : isListening ? '👂' : '🎤'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Sound wave bars ── */}
      <div style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        marginBottom: 14,
        opacity: isTalking ? 1 : 0,
        transition: 'opacity 0.4s',
      }}>
        {[0.5, 0.85, 1.1, 1.4, 1.0, 1.3, 0.75, 1.1, 0.6].map((amp, i) => (
          <div key={i} style={{
            width: 4,
            borderRadius: 4,
            background: `linear-gradient(to top, #0D9488, #5EEAD4)`,
            height: `${Math.max(4, Math.min(32, 4 + volume * 60 * amp))}px`,
            animation: `soundBar ${0.6 + i * 0.07}s ease-in-out infinite alternate`,
            transition: 'height 0.07s',
            boxShadow: '0 0 6px rgba(45,212,191,0.4)',
          }} />
        ))}
      </div>

      {/* ── Status label ── */}
      <p style={{
        fontSize: '0.8rem',
        fontWeight: isActive ? 600 : 400,
        color: status === 'error'
          ? '#F87171'
          : isActive
            ? '#2DD4BF'
            : 'rgba(240,244,248,0.32)',
        letterSpacing: isActive ? '0.06em' : '0.02em',
        textTransform: isActive ? 'uppercase' : 'none',
        marginBottom: 22,
        minHeight: 18,
        textAlign: 'center',
        transition: 'color 0.3s',
      }}>
        {statusText}
      </p>

      {/* ── Action button ── */}
      <button
        onClick={isActive ? stopCall : startCall}
        disabled={isConnecting}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          background: isActive
            ? 'rgba(239,68,68,0.08)'
            : 'rgba(45,212,191,0.08)',
          color: isActive ? '#FC8181' : '#2DD4BF',
          border: `1.5px solid ${isActive ? 'rgba(239,68,68,0.2)' : 'rgba(45,212,191,0.2)'}`,
          borderRadius: 14,
          padding: '13px 32px',
          fontSize: '0.88rem',
          fontWeight: 700,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '-0.01em',
          cursor: isConnecting ? 'wait' : 'pointer',
          backdropFilter: 'blur(12px)',
          boxShadow: isActive
            ? 'none'
            : '0 0 20px rgba(45,212,191,0.08)',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: '1rem' }}>
          {isConnecting ? '⏳' : isActive ? '⏹' : '🎤'}
        </span>
        {isConnecting ? strings.status_connecting : isActive ? strings.stop : strings.start}
      </button>

      {/* ── Scheduled banner ── */}
      {scheduled && (
        <div style={{
          marginTop: 28,
          width: '100%',
          background: 'rgba(45,212,191,0.07)',
          border: '1.5px solid rgba(45,212,191,0.2)',
          borderRadius: 18,
          padding: '24px 28px',
          textAlign: 'center',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 0 0 1px rgba(45,212,191,0.08) inset',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>✅</div>
          <p style={{
            fontFamily: "'Poppins', sans-serif",
            color: '#2DD4BF',
            fontWeight: 700,
            fontSize: '1rem',
            marginBottom: 6,
          }}>
            {strings.scheduled_title}
          </p>
          <p style={{ color: 'rgba(240,244,248,0.45)', fontSize: '0.82rem' }}>
            {strings.scheduled_sub}{scheduledEmail ? ` (${scheduledEmail})` : ''}
          </p>
        </div>
      )}

      <style>{`
        @keyframes orbRing {
          0%   { transform: scale(1);   opacity: 1; }
          100% { transform: scale(1.75); opacity: 0; }
        }
        @keyframes soundBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1.7); }
        }
      `}</style>
    </div>
  )
}
