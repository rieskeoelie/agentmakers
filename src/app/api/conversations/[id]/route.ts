import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

const EL_BASE = 'https://api.elevenlabs.io/v1/convai'

/** GET /api/conversations/[id]  — transcript + metadata for one conversation */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) return NextResponse.json({ error: 'Missing ElevenLabs config' }, { status: 500 })

  const res = await fetch(`${EL_BASE}/conversations/${id}`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
