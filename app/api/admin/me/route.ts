// app/api/admin/me/route.ts
import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

export async function GET() {
  const supabase = await createRouteClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
        { ok: false, reason: 'unauthorized' },
        { status: 401 },
    )
  }

  const { data: admin, error: adminError } = await supabase
  .from('admins')
  .select('*')
  .eq('user_id', user.id)
  .maybeSingle()

  if (adminError) {
    return NextResponse.json(
        { ok: false, reason: 'admin_query_failed' },
        { status: 500 },
    )
  }

  if (!admin) {
    return NextResponse.json(
        { ok: false, reason: 'forbidden' },
        { status: 403 },
    )
  }

  return NextResponse.json({ ok: true, userId: user.id, admin })
}
