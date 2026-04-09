import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createSession, sessionCookieOptions } from '@/lib/auth'

// TIJDELIJK — verwijder zodra login werkt
export async function GET() {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, is_admin')
    .eq('username', 'richard')
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const token = createSession({
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: user.is_admin,
    isSuperAdmin: true,
  })

  const res = NextResponse.json({ ok: true, displayName: user.display_name })
  res.cookies.set(sessionCookieOptions(token))
  return res
}
