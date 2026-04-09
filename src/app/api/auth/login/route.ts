import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyPassword, createSession, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, password_hash, is_admin')
      .eq('username', username.toLowerCase().trim())
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Fallback: treat 'richard' as superadmin until DB migration adds is_superadmin column
    const isSuperAdmin = (user as typeof user & { is_superadmin?: boolean }).is_superadmin ?? (user.username === 'richard')

    const token = createSession({
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: user.is_admin,
      isSuperAdmin,
    })

    const res = NextResponse.json({
      ok: true,
      user: { username: user.username, displayName: user.display_name, isAdmin: user.is_admin, isSuperAdmin },
    })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
