import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

const EL_BASE = 'https://api.elevenlabs.io/v1/convai'

/** GET /api/conversations  — list conversations for all configured agents */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ElevenLabs API key' }, { status: 500 })
  }

  // Collect all unique agent IDs across NL / EN / ES (fall back to generic ID)
  const fallback = process.env.ELEVENLABS_AGENT_ID
  const ids = [
    process.env.ELEVENLABS_AGENT_ID_NL || fallback,
    process.env.ELEVENLABS_AGENT_ID_EN || fallback,
    process.env.ELEVENLABS_AGENT_ID_ES || fallback,
  ].filter(Boolean) as string[]

  const uniqueIds = [...new Set(ids)]

  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: 'No ElevenLabs agent IDs configured' }, { status: 500 })
  }

  // Fetch conversations for all agents in parallel
  const results = await Promise.all(
    uniqueIds.map(agentId =>
      fetch(`${EL_BASE}/conversations?agent_id=${agentId}&page_size=50`, {
        headers: { 'xi-api-key': apiKey },
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    )
  )

  // Merge and deduplicate by conversation_id
  const seen = new Set<string>()
  const conversations = results
    .flatMap(d => d?.conversations ?? [])
    .filter((c: { conversation_id: string }) => {
      if (seen.has(c.conversation_id)) return false
      seen.add(c.conversation_id)
      return true
    })
    .sort((a: { start_time_unix_secs: number }, b: { start_time_unix_secs: number }) =>
      b.start_time_unix_secs - a.start_time_unix_secs
    )

  return NextResponse.json({ conversations })
}
