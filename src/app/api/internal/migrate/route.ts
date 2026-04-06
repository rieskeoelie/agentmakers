import { NextRequest, NextResponse } from 'next/server'

// ONE-TIME migration endpoint — DELETE THIS FILE after running once
// Auth: x-migrate-token must equal ADMIN_SECRET_KEY
export async function POST(req: NextRequest) {
  if (req.headers.get('x-migrate-token') !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Extract project ref from URL
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]

  // Get Supabase PAT from env (we'll pass it in the request body as fallback)
  const body = await req.json().catch(() => ({})) as { pat?: string }
  const pat = body.pat

  if (!pat) {
    return NextResponse.json({ error: 'Pass your Supabase PAT as { pat: "..." } in the request body. Get it from https://supabase.com/dashboard/account/tokens' }, { status: 400 })
  }

  const sql = `
-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add user_id to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);

-- 3. Seed users (Richard = admin, Gerard = franchisee)
INSERT INTO users (username, display_name, password_hash, is_admin)
VALUES
  ('richard', 'Richard', 'f5ba1b224ce3ad39dfaafb6e090c8ecf:01635288e0502aeebe10e4b5af884095a5712b1b6add99f2762b25c474aca8390c21b2ca1a75ec41bf7876ce2b67819b182c2109477ce481e101cf11c4f57dc7', TRUE),
  ('gerard', 'Gerard Bakker', 'ec80a1eea69fca6cf4f64c608198dce6:494f342bbc160134dd5b0344e34a028b33aa9060460f92cd11e26291b5d26b157abd4b833151312f7074bc21616b76d8e4bb40962b3d795e62df74c40e706c06', FALSE)
ON CONFLICT (username) DO NOTHING;

-- 4. Assign all existing leads to Richard
UPDATE leads
SET user_id = (SELECT id FROM users WHERE username = 'richard')
WHERE user_id IS NULL;
`

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: 'Migration failed', details: data }, { status: 500 })
    }
    return NextResponse.json({ success: true, message: 'Migration complete. Delete /api/internal/migrate now!', data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
