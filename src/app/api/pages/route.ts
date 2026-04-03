import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { autoTranslatePage } from '@/lib/translate'

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-admin-key')
  return key === process.env.ADMIN_SECRET_KEY
}

// Fields that, when changed, should trigger auto-translation of EN+ES
const NL_CONTENT_FIELDS = [
  'hero_headline_nl', 'hero_subline_nl', 'body_content_nl',
  'title_nl', 'meta_description_nl',
]

// GET all pages (admin)
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('landing_pages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH update a page (status or content)
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('landing_pages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-translate EN+ES if any NL content field was changed
  const nlChanged = NL_CONTENT_FIELDS.some(field => field in updates)
  if (nlChanged) {
    // Fire-and-forget: don't block the response
    autoTranslatePage(id).catch(err =>
      console.error('[auto-translate] Failed for page', id, err)
    )
  }

  return NextResponse.json(data)
}

// DELETE a page
export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('landing_pages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
