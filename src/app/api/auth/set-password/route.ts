import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, hashPassword } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/** PATCH — superadmin sets a new password for any user (or own password) */
export async function PATCH(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, password } = await req.json()

    // Allow: superadmin setting anyone's password, OR user changing own password
    const isSelf = userId === session.userId
    if (!session.isSuperAdmin && !isSelf) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' }, { status: 400 })
    }

    const newHash = await hashPassword(password)

    const { error } = await supabaseAdmin
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', userId)

    if (error) return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
