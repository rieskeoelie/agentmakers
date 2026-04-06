import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

const EL_BASE = 'https://api.elevenlabs.io/v1/convai'

/** GET /api/conversations/[id]/audio  — proxies the audio recording */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) return new NextResponse('Missing config', { status: 500 })

  const upstream = await fetch(`${EL_BASE}/conversations/${id}/audio`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!upstream.ok) return new NextResponse('Audio unavailable', { status: upstream.status })

  const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg'
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
