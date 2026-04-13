import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { autoTranslatePage } from '@/lib/translate'
import { getSessionFromRequest } from '@/lib/auth'

// Fields that, when changed, should trigger auto-translation of EN+ES
const NL_CONTENT_FIELDS = [
  'hero_headline_nl', 'hero_subline_nl', 'body_content_nl',
  'title_nl', 'meta_description_nl',
]

// GET pages (superadmin ziet alles, partners zien alleen hun eigen pagina's via hun leads)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.isSuperAdmin) {
    // Superadmin: alle pagina's
    const { data, error } = await supabaseAdmin
      .from('landing_pages')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Partner: alleen pagina's die horen bij hun eigen leads
  const { data: userLeads, error: leadsError } = await supabaseAdmin
    .from('leads')
    .select('landing_page_slug')
    .eq('user_id', session.userId)
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 })

  const slugs = [...new Set((userLeads ?? []).map(l => l.landing_page_slug).filter(Boolean))]
  if (slugs.length === 0) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('landing_pages')
    .select('*')
    .in('slug', slugs)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Helper: check if a partner owns the page (via their leads)
async function partnerOwnsPage(userId: string, pageId: string): Promise<boolean> {
  const { data: page } = await supabaseAdmin
    .from('landing_pages').select('slug').eq('id', pageId).single()
  if (!page?.slug) return false
  const { data: lead } = await supabaseAdmin
    .from('leads').select('id').eq('user_id', userId).eq('landing_page_slug', page.slug).limit(1).single()
  return !!lead
}

// PATCH update a page (status or content)
export async function PATCH(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Partners may only edit their own pages
  if (!session.isSuperAdmin) {
    const owns = await partnerOwnsPage(session.userId, id)
    if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('landing_pages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-translate EN+ES if any NL content field was changed.
  // Use `after()` so Vercel keeps the function alive until translation completes
  // instead of killing it the moment the response is sent.
  const nlChanged = NL_CONTENT_FIELDS.some(field => field in updates)
  if (nlChanged) {
    after(async () => {
      try {
        await autoTranslatePage(id)
      } catch (err) {
        console.error('[auto-translate] Failed for page', id, err)
      }
    })
  }

  return NextResponse.json(data)
}

// DELETE a page
export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Partners may only delete their own pages
  if (!session.isSuperAdmin) {
    const owns = await partnerOwnsPage(session.userId, id)
    if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('landing_pages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
