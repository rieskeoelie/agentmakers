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

type CallStatus = 'idle' | 'connecting' | 'listening' | 'talking' | 'error'

export function VoiceDemo({ token, strings, logoUrl }: Props) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [scheduledEmail, setScheduledEmail] = useState('')
  const [volume, setVolume] = useState(0)
  const [logoError, setLogoError] = useState(false)
  const conversationRef = useRef<VoiceConversation | null>(null)
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const tick = () => {
      if (conversationRef.current) {
        setVolume(conversationRef.current.getOutputVolume())
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [])

  const startCall = useCallback(async () => {
    setStatus('connecting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/signed-url?token=${token}`)
      if (!res.ok) throw new Error('Could not get signed URL')
      const { signed_url, business_info } = await res.json()

      const conversation = await VoiceConversation.startSession({
        signedUrl: signed_url,
        dynamicVariables: {
          business_info: business_info || 'Geen informatie beschikbaar.',
        },
        clientTools: {
          collect_lead_info: async (params: { naam?: string; email?: string; telefoon?: string }) => {
            try {
              const r = await fetch('/api/demo-collect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...params }),
              })
              const data = await r.json()
              if (data.success) {
                setScheduled(true)
                setScheduledEmail(params.email || '')
              }
              return `Bedankt${params.naam ? ' ' + params.naam : ''}! Ik heb een persoonlijke meeting link gestuurd naar ${params.email}. Kijk snel in uw inbox!`
            } catch {
              return 'Er is iets misgegaan, maar u kunt altijd een afspraak maken via agentmakers.io.'
            }
          },
        },
        onConnect: () => setStatus('listening'),
        onDisconnect: () => { setStatus('idle'); conversationRef.current = null },
        onError: (message: string) => {
          setErrorMsg(message || 'Er is een fout opgetreden.')
          setStatus('error')
          conversationRef.current = null
        },
        onModeChange: ({ mode }: { mode: string }) => {
          if (mode === 'speaking') setStatus('talking')
          else if (mode === 'listening') setStatus('listening')
        },
      })
      conversationRef.current = conversation
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kan de verbinding niet starten.')
      setStatus('error')
    }
  }, [token])

  const stopCall = useCallback(async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession()
      conversationRef.current = null
    }
    setStatus('idle')
  }, [])

  const isActive = status !== 'idle' && status !== 'error'
  const isConnecting = status === 'connecting'
  const isTalking = status === 'talking'
  const isListening = status === 'listening'

  const statusLabel = {
    idle: strings.status_ready,
    connecting: strings.status_connecting,
    listening: strings.status_listening,
    talking: strings.status_talking,
    error: errorMsg || 'Er is een fout opgetreden.',
  }[status]

  const glowSize = isTalking ? 40 + volume * 80 : isListening ? 20 : 0
  const orbScale = isTalking ? 1 + volume * 0.06 : 1

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      width: '100%', maxWidth: 560,
    }}>
      {/* Orb */}
      <div
        onClick={isActive ? stopCall : startCall}
        style={{
          position: 'relative',
          width: 190, height: 190,
          cursor: isConnecting ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        {/* Pulse rings */}
        {isActive && [0, 0.5, 1.0].map((delay, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 190, height: 190,
            borderRadius: '50%',
            border: `1px solid rgba(45,212,191,${isTalking ? 0.45 - i * 0.12 : 0.2 - i * 0.05})`,
            animation: `ringPulse 2s ease-out ${delay}s infinite`,
          }} />
        ))}

        {/* Glow halo */}
        {isActive && (
          <div style={{
            position: 'absolute',
            width: 140, height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(45,212,191,0.3) 0%, transparent 70%)',
            filter: `blur(${glowSize}px)`,
            transition: 'filter 0.12s',
            transform: `scale(${orbScale})`,
          }} />
        )}

        {/* Orb surface */}
        <div style={{
          width: 138, height: 138,
          borderRadius: '50%',
          transform: `scale(${orbScale})`,
          transition: 'transform 0.1s',
          background: isActive
            ? 'linear-gradient(145deg, #0A3D38 0%, #0D9488 55%, #2DD4BF 100%)'
            : 'linear-gradient(145deg, #0D1117 0%, #0F2E2B 55%, #0D9488 100%)',
          boxShadow: isActive
            ? `0 0 ${20 + glowSize * 0.5}px rgba(45,212,191,0.55),
               0 0 60px rgba(13,148,136,0.25),
               inset 0 1px 0 rgba(255,255,255,0.18)`
            : '0 0 16px rgba(13,148,136,0.18), inset 0 1px 0 rgba(255,255,255,0.07)',
          border: isActive
            ? '1.5px solid rgba(45,212,191,0.45)'
            : '1px solid rgba(255,255,255,0.09)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Company logo (idle) or status icon (active) */}
          {!isActive && logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt=""
              width={50} height={50}
              style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 8, opacity: 0.8 }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>
              {isConnecting ? '⏳' : isTalking ? '🔊' : isListening ? '👂' : '🎤'}
            </span>
          )}
        </div>
      </div>

      {/* Sound wave bars */}
      {isTalking && (
        <div style={{
          display: 'flex', gap: 5, alignItems: 'center', height: 34,
          marginBottom: 20,
        }}>
          {[0.6, 1.1, 0.75, 1.3, 0.5, 1.2, 0.85, 1.0, 0.65].map((amp, i) => (
            <div key={i} style={{
              width: 4, borderRadius: 4,
              background: 'linear-gradient(to top, #0D9488, #2DD4BF)',
              height: `${Math.max(5, Math.min(32, 5 + volume * 65 * amp))}px`,
              animation: `wave ${0.65 + i * 0.08}s ease-in-out infinite alternate`,
              transition: 'height 0.07s',
            }} />
          ))}
        </div>
      )}

      {/* Status label */}
      <p style={{
        color: status === 'error' ? '#F87171' : isActive ? '#2DD4BF' : 'rgba(255,255,255,0.38)',
        fontSize: '0.82rem',
        fontWeight: isActive ? 600 : 400,
        letterSpacing: isActive ? '0.03em' : 0,
        marginBottom: 22,
        minHeight: 18,
        textAlign: 'center',
        textTransform: isActive ? 'uppercase' : 'none',
      }}>
        {statusLabel}
      </p>

      {/* Action button */}
      <button
        onClick={isActive ? stopCall : startCall}
        disabled={isConnecting}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: isActive ? 'rgba(239,68,68,0.09)' : 'rgba(45,212,191,0.09)',
          color: isActive ? '#F87171' : '#2DD4BF',
          border: `1.5px solid ${isActive ? 'rgba(239,68,68,0.22)' : 'rgba(45,212,191,0.22)'}`,
          borderRadius: 12, padding: '12px 32px',
          fontSize: '0.88rem', fontWeight: 700,
          cursor: isConnecting ? 'wait' : 'pointer',
          fontFamily: "'Inter', sans-serif",
          backdropFilter: 'blur(8px)',
          letterSpacing: '0.01em',
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        <span>{isConnecting ? '⏳' : isActive ? '⏹' : '🎤'}</span>
        {isConnecting ? strings.status_connecting : isActive ? strings.stop : strings.start}
      </button>

      {/* Scheduled confirmation */}
      {scheduled && (
        <div style={{
          marginTop: 32,
          background: 'rgba(45,212,191,0.07)',
          border: '1.5px solid rgba(45,212,191,0.22)',
          borderRadius: 18,
          padding: '24px 28px',
          textAlign: 'center',
          width: '100%', maxWidth: 460,
          backdropFilter: 'blur(16px)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>✅</div>
          <p style={{ color: '#2DD4BF', fontWeight: 700, fontSize: '0.97rem', marginBottom: 6 }}>
            {strings.scheduled_title}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem' }}>
            {strings.scheduled_sub}{scheduledEmail ? ` (${scheduledEmail})` : ''}
          </p>
        </div>
      )}

      <style>{`
        @keyframes ringPulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes wave {
          from { transform: scaleY(0.3); }
          to { transform: scaleY(1.7); }
        }
      `}</style>
    </div>
  )
}
