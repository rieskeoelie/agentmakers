import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/** GET /api/admin/users — superadmin only: list all users with stats */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // All users
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, is_admin, is_superadmin, created_at')
    .order('created_at', { ascending: true })

  if (error || !users) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  // Per-user lead counts (total + this month)
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: allLeads } = await supabaseAdmin
    .from('leads')
    .select('user_id, created_at, demo_token')

  const { data: conversations } = await supabaseAdmin
    .from('leads')
    .select('user_id, demo_token')
    .not('demo_token', 'is', null)

  // Build stats per user
  const stats = users.map(u => {
    const userLeads = allLeads?.filter(l => l.user_id === u.id) ?? []
    const leadsThisMonth = userLeads.filter(l => l.created_at >= startOfMonth).length
    const demosGenerated = userLeads.filter(l => l.demo_token).length
    const convCount = conversations?.filter(l => l.user_id === u.id).length ?? 0

    // Last activity = most recent lead
    const lastLead = userLeads.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]

    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      isAdmin: u.is_admin,
      isSuperAdmin: u.is_superadmin ?? false,
      createdAt: u.created_at,
      leadsTotal: userLeads.length,
      leadsThisMonth,
      demosGenerated,
      conversations: convCount,
      lastActiveAt: lastLead?.created_at ?? null,
    }
  })

  return NextResponse.json({ users: stats })
}

/** PATCH /api/admin/users — superadmin only: update a user's role */
export async function PATCH(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session?.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, isAdmin, isSuperAdmin } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_admin: isAdmin, is_superadmin: isSuperAdmin })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
