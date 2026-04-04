import { NextRequest, NextResponse } from 'next/server'

const EL_BASE = 'https://api.elevenlabs.io/v1/convai'

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key')
  return key === process.env.ADMIN_SECRET_KEY
}

/** GET /api/conversations  — list all conversations for the agent */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentId = process.env.ELEVENLABS_AGENT_ID
  const apiKey  = process.env.ELEVENLABS_API_KEY

  if (!agentId || !apiKey) {
    return NextResponse.json({ error: 'Missing ElevenLabs config' }, { status: 500 })
  }

  const url = `${EL_BASE}/conversations?agent_id=${agentId}&page_size=50`
  const res = await fetch(url, { headers: { 'xi-api-key': apiKey } })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
