import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMyMember } from '@/lib/members/myMember'
import { listRiotAccounts } from '@/lib/members/primaryAccount'

// 개인화 응답이므로 어떤 캐시에도 태워서는 안 된다.
export const dynamic = 'force-dynamic'

export type ProfileStatus = {
  hasMember: boolean
  status: string | null
  riotAccountCount: number
  hasSteam: boolean
  hasProfileImage: boolean
  /** steam_visibility === 3 (공개 프로필). 스팀 미연결이면 false. */
  steamVisibilityOk: boolean
}

export async function GET() {
  // ⚠ 대상은 오직 세션으로만 결정한다. 쿼리·body 의 어떤 member 식별자도 읽지 않는다.
  const me = await getMyMember()
  if (!me.ok) {
    return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  }

  if (!me.member) {
    const empty: ProfileStatus = {
      hasMember: false,
      status: null,
      riotAccountCount: 0,
      hasSteam: false,
      hasProfileImage: false,
      steamVisibilityOk: false,
    }
    return NextResponse.json({ ok: true, ...empty })
  }

  const { data: row, error } = await supabaseAdmin
    .from('members')
    .select('steam_id64, steam_visibility, profile_image_path')
    .eq('id', me.member.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  // 마이그레이션 미적용(테이블 부재)은 "계정 0개"로 degrade한다 — 체크리스트는 안내일 뿐이다.
  const listed = await listRiotAccounts(me.member.id)
  const riotAccountCount = listed.ok ? listed.accounts.length : 0

  const status: ProfileStatus = {
    hasMember: true,
    status: me.member.status,
    riotAccountCount,
    hasSteam: !!row?.steam_id64,
    hasProfileImage: !!row?.profile_image_path,
    steamVisibilityOk: !!row?.steam_id64 && row?.steam_visibility === 3,
  }

  return NextResponse.json({ ok: true, ...status })
}
