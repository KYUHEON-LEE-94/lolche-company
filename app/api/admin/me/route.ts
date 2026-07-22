import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'

export async function GET() {
  const supabase = await createRouteClient()
  const { data: { user: sessionUser }, error: userError } = await supabase.auth.getUser()

  // 미로그인은 401 (호출부가 /admin/login 리다이렉트 판단에 사용)
  if (userError || !sessionUser) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  // requireAdmin이 user_id 매칭 → discord_id 매칭 → user_id 백필까지 처리한다.
  const { ok, user } = await requireAdmin()

  if (!ok || !user) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }

  const columns = 'user_id, discord_id, display_name, is_super_admin, created_at'

  const { data: admin, error: adminError } = await supabaseService
    .schema('public')
    .from('admins')
    .select(columns)
    .eq('user_id', user.id)
    .maybeSingle()

  // 권한 자체는 requireAdmin()에서 이미 확인됐다.
  // 상세 조회 실패(예: discord_id 컬럼 마이그레이션 전)로 관리자를 잠그면 안 되므로
  // 500 대신 admin: null로 응답해 호출부의 401/403 분기를 유지한다.
  if (adminError) {
    console.error('[api/admin/me] admins 상세 조회 실패', adminError.message)
    return NextResponse.json({ ok: true, userId: user.id, admin: null })
  }

  if (admin) {
    return NextResponse.json({ ok: true, userId: user.id, admin })
  }

  // 백필이 실패한 경우에도 권한 자체는 확인되었으므로 discord_id로 행을 되찾는다.
  const discordId = getDiscordId(user)
  if (!discordId) {
    return NextResponse.json({ ok: true, userId: user.id, admin: null })
  }

  const { data: byDiscord } = await supabaseService
    .schema('public')
    .from('admins')
    .select(columns)
    .eq('discord_id', discordId)
    .maybeSingle()

  return NextResponse.json({ ok: true, userId: user.id, admin: byDiscord ?? null })
}
