import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWeeklyReport } from '@/lib/email'

// Runs every Monday at 08:00 via Vercel Cron
// Compiles weekly stats and sends email to admin

function isAuthorized(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const adminKey = req.headers.get('x-admin-key')
  return (
    bearer === process.env.CRON_SECRET ||
    adminKey === process.env.ADMIN_SECRET_KEY
  )
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Fetch leads from last 7 days
  const { data: newLeadsData } = await supabaseAdmin
    .from('leads')
    .select('id')
    .gte('created_at', weekAgo.toISOString())

  // Fetch total leads
  const { count: totalLeads } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })

  // Fetch pages to find the top performer
  const { data: pages } = await supabaseAdmin
    .from('pages')
    .select('industry, visits, conversions')
    .gt('visits', 0)
    .order('conversions', { ascending: false })
    .limit(1)

  const newLeads = newLeadsData?.length ?? 0
  const topPage = pages?.[0]?.industry ?? '—'

  // Fetch conversation count from ElevenLabs if configured
  let conversations = 0
  try {
    const elevenlabsKey = process.env.ELEVENLABS_API_KEY
    const agentId = process.env.ELEVENLABS_AGENT_ID
    if (elevenlabsKey && agentId) {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`,
        { headers: { 'xi-api-key': elevenlabsKey } }
      )
      if (res.ok) {
        const data = await res.json()
        const convs = data.conversations ?? []
        // Count conversations from the last 7 days
        const weekAgoSecs = weekAgo.getTime() / 1000
        conversations = convs.filter((c: { start_time_unix_secs: number }) =>
          c.start_time_unix_secs >= weekAgoSecs
        ).length
      }
    }
  } catch { /* non-critical */ }

  await sendWeeklyReport({
    newLeads,
    totalLeads: totalLeads ?? 0,
    conversations,
    topPage,
  })

  return NextResponse.json({ success: true, newLeads, totalLeads, conversations, topPage })
}
