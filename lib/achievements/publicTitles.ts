import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import type { PublicTitleBadge } from '@/lib/achievements/titles'

type EquippedTitleRow = {
  member_id: string
  slot: number
  title_id: string
}

type TitleRow = {
  id: string
  label: string
}

type PublicEquippedTitleRow = {
  member_id: string
  title_id: string
  label: string
  slot: number
}

function appendTitle(
  result: Map<string, PublicTitleBadge[]>,
  memberId: string,
  title: PublicTitleBadge,
) {
  const current = result.get(memberId) ?? []
  current.push(title)
  result.set(memberId, current)
}

/** 공개 카드에서 사용할 장착 칭호를 두 번의 배치 쿼리로 합친다. */
export async function getEquippedTitlesByMemberIds(
  memberIds: string[],
): Promise<Map<string, PublicTitleBadge[]>> {
  const uniqueMemberIds = [...new Set(memberIds)]
  const result = new Map<string, PublicTitleBadge[]>()
  if (uniqueMemberIds.length === 0) return result

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    'list_public_equipped_titles',
    { p_member_ids: uniqueMemberIds },
  )

  if (!rpcError) {
    for (const row of (rpcData ?? []) as PublicEquippedTitleRow[]) {
      appendTitle(result, row.member_id, { id: row.title_id, label: row.label })
    }
    return result
  }
  if (!isMissingFunctionError(rpcError)) {
    console.warn('[achievements] 공개 칭호 RPC 실패:', rpcError.message)
    return result
  }

  // 후속 RPC 마이그레이션 전 배포에서도 기존 Data API가 노출된 프로젝트는 동작한다.
  const { data: equippedData, error: equippedError } = await supabaseAdmin
    .from('member_equipped_titles')
    .select('member_id,slot,title_id')
    .in('member_id', uniqueMemberIds)
    .order('slot', { ascending: true })

  if (equippedError) {
    if (!isMissingTableError(equippedError)) {
      console.warn('[achievements] 공개 칭호 조회 실패:', equippedError.message)
    }
    return result
  }

  const equippedRows = (equippedData ?? []) as EquippedTitleRow[]
  const titleIds = [...new Set(equippedRows.map((row) => row.title_id))]
  if (titleIds.length === 0) return result

  const { data: titleData, error: titleError } = await supabaseAdmin
    .from('achievement_titles')
    .select('id,label')
    .eq('is_active', true)
    .in('id', titleIds)

  if (titleError) {
    if (!isMissingTableError(titleError)) {
      console.warn('[achievements] 칭호 카탈로그 조회 실패:', titleError.message)
    }
    return result
  }

  const labels = new Map((titleData ?? []).map((row) => {
    const title = row as TitleRow
    return [title.id, title.label] as const
  }))

  for (const row of equippedRows) {
    const label = labels.get(row.title_id)
    if (!label) continue
    appendTitle(result, row.member_id, { id: row.title_id, label })
  }

  return result
}
