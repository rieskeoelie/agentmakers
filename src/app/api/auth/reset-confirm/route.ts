import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyResetToken } from '../reset-request/route'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token en wachtwoord vereist' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' }, { status: 400 })
    }

    const payload = verifyResetToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Ongeldige of verlopen link. Vraag een nieuwe aan.' }, { status: 400 })
    }

    const newHash = await hashPassword(password)

    const { error } = await supabaseAdmin
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', payload.userId)

    if (error) {
      return NextResponse.json({ error: 'Wachtwoord opslaan mislukt' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
