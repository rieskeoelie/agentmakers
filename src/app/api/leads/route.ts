import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let query = supabaseAdmin.from('leads').select('*').order('created_at', { ascending: false })
  // Superadmin ziet alles; partners zien alleen hun eigen leads
  if (!session.isSuperAdmin) { query = query.eq('user_id', session.userId) }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { ids } = await req.json() as { ids: string[] }
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
  }
  let query = supabaseAdmin.from('leads').delete().in('id', ids)
  if (!session.isSuperAdmin) { query = query.eq('user_id', session.userId) }
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: ids.length })
}
