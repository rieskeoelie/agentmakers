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
}

type CallStatus = 'idle' | 'connecting' | 'listening' | 'talking' | 'error'

export function VoiceDemo({ token, strings }: Props) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [scheduledEmail, setScheduledEmail] = useState('')
  const conversationRef = useRef<VoiceConversation | null>(null)
  const volumeRef = useRef<number>(0)
  const [volume, setVolume] = useState(0)
  const animFrameRef = useRef<number | null>(null)

  // Animate volume indicator
  useEffect(() => {
    const tick = () => {
      if (conversationRef.current && status !== 'idle') {
        const v = conversationRef.current.getOutputVolume()
        volumeRef.current = v
        setVolume(v)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [status])

  const startCall = useCallback(async () => {
    setStatus('connecting')
    setErrorMsg('')

    try {
      // Get signed URL + business_info from our server
      const res = await fetch(`/api/signed-url?token=${token}`)
      if (!res.ok) throw new Error('Could not get signed URL')
      const { signed_url, business_info } = await res.json()

      // Start ElevenLabs conversation
      const conversation = await VoiceConversation.startSession({
        signedUrl: signed_url,
        dynamicVariables: {
          business_info: business_info || 'Geen informatie beschikbaar.',
        },
        clientTools: {
          collect_lead_info: async (params: { naam?: string; email?: string; telefoon?: string }) => {
            try {
              const res = await fetch('/api/demo-collect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...params }),
              })
              const data = await res.json()
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
        onDisconnect: () => {
          setStatus('idle')
          conversationRef.current = null
        },
        onError: (message: string) => {
          console.error('Conversation error:', message)
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
      console.error('Start call error:', err)
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

  const statusLabel = {
    idle: strings.status_ready,
    connecting: strings.status_connecting,
    listening: strings.status_listening,
    talking: strings.status_talking,
    error: errorMsg || 'Er is een fout opgetreden.',
  }[status]

  const isActive = status !== 'idle' && status !== 'error'
  const isConnecting = status === 'connecting'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      {/* Orb / pulse animation */}
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {/* Outer pulse rings when active */}
        {isActive && (
          <>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'rgba(45,212,191,0.15)',
                animation: 'pulse 1.5s ease-in-out infinite',
                transform: `scale(${1 + volume * 0.5})`,
                transition: 'transform 0.1s',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: -10,
                borderRadius: '50%',
                background: 'rgba(45,212,191,0.08)',
                animation: 'pulse 1.5s ease-in-out 0.3s infinite',
              }}
            />
          </>
        )}

        {/* Main orb button */}
        <button
          onClick={isActive ? stopCall : startCall}
          disabled={isConnecting}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            border: 'none',
            background: isActive
              ? status === 'talking'
                ? 'linear-gradient(135deg, #0D9488, #2DD4BF)'
                : 'linear-gradient(135deg, #134E4A, #0D9488)'
              : 'linear-gradient(135deg, #0D9488, #14B8A6)',
            cursor: isConnecting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isActive
              ? '0 0 40px rgba(45,212,191,0.5)'
              : '0 8px 32px rgba(13,148,136,0.4)',
            transition: 'all 0.3s ease',
            fontSize: '2.2rem',
          }}
        >
          {isConnecting ? '⏳' : isActive ? '⏹' : '🎤'}
        </button>
      </div>

      {/* Status label */}
      <p
        style={{
          color: status === 'error' ? '#F87171' : '#CCFBF1',
          fontSize: '0.95rem',
          margin: 0,
          minHeight: 24,
          textAlign: 'center',
        }}
      >
        {statusLabel}
      </p>

      {/* Wave bars when talking */}
      {status === 'talking' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 32 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              style={{
                width: 5,
                borderRadius: 3,
                background: '#2DD4BF',
                height: `${Math.max(6, Math.min(32, 8 + volume * 80 * Math.sin(i * 0.8 + Date.now() / 200)))}px`,
                animation: `wave ${0.8 + i * 0.1}s ease-in-out infinite alternate`,
                transition: 'height 0.1s',
              }}
            />
          ))}
        </div>
      )}

      {/* Action button text */}
      <button
        onClick={isActive ? stopCall : startCall}
        disabled={isConnecting}
        style={{
          background: isActive ? 'rgba(239,68,68,0.15)' : 'rgba(45,212,191,0.15)',
          color: isActive ? '#F87171' : '#2DD4BF',
          border: `1.5px solid ${isActive ? 'rgba(239,68,68,0.3)' : 'rgba(45,212,191,0.3)'}`,
          borderRadius: 10,
          padding: '12px 28px',
          fontSize: '1rem',
          fontWeight: 700,
          cursor: isConnecting ? 'wait' : 'pointer',
          fontFamily: "'Nunito', sans-serif",
          transition: 'all 0.2s',
        }}
      >
        {isConnecting ? strings.status_connecting : isActive ? strings.stop : strings.start}
      </button>

      {/* Scheduled confirmation banner */}
      {scheduled && (
        <div
          style={{
            marginTop: 16,
            background: 'rgba(45,212,191,0.12)',
            border: '1.5px solid rgba(45,212,191,0.35)',
            borderRadius: 14,
            padding: '20px 24px',
            textAlign: 'center',
            maxWidth: 420,
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
          <p style={{ color: '#2DD4BF', fontWeight: 700, fontSize: '1rem', margin: '0 0 6px' }}>
            {strings.scheduled_title}
          </p>
          <p style={{ color: '#CCFBF1', fontSize: '0.88rem', margin: 0 }}>
            {strings.scheduled_sub}{scheduledEmail ? ` (${scheduledEmail})` : ''}
          </p>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.15); }
        }
        @keyframes wave {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.5); }
        }
      `}</style>
    </div>
  )
}
