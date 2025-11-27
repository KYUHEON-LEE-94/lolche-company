// app/api/admin/sync-all/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const MEMBER_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '1500') // 멤버 간 기본 딜레이
const RETRY_429_DELAY_MS = Number(process.env.RIOT_429_DELAY_MS ?? '30000') // 429 뜨면 기다릴 시간 (기본 30초)
const MAX_RETRY_PER_MEMBER = 3

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 🔁 429 고려해서 /api/members/[id]/sync 호출하는 래퍼
async function callMemberSyncWithRetry(origin: string, memberId: string) {
  let lastRes: Response | null = null

  for (let attempt = 1; attempt <= MAX_RETRY_PER_MEMBER; attempt++) {
    const res = await fetch(`${origin}/api/members/${memberId}/sync`, {
      method: 'POST',
    })
    lastRes = res

    // 429가 아니면 그냥 반환
    if (res.status !== 429) {
      return res
    }

    // 429면: Riot 쪽에서도 보통 Retry-After 헤더 내려줌
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : RETRY_429_DELAY_MS

    console.warn(
        `[sync-all] member=${memberId} 429 발생, attempt=${attempt}/${MAX_RETRY_PER_MEMBER}, ${retryMs}ms 대기`,
    )

    // 마지막 시도면 더 이상 대기하지 않고 루프 빠져나감
    if (attempt === MAX_RETRY_PER_MEMBER) break

    await sleep(retryMs)
  }

  // 모든 재시도 후 마지막 응답 리턴
  return lastRes as Response
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin

  // 1) 전체 멤버 조회
  const { data: members, error } = await supabase
      .from('members')
      .select('id, member_name, last_synced_at')
      .order('member_name', { ascending: true })

  if (error || !members) {
    console.error('load members error', error)
    return NextResponse.json(
        { error: '멤버 목록 조회 실패' },
        { status: 500 },
    )
  }

  const results: Array<{
    memberId: string
    status: number
    ok: boolean
    message?: string | null
  }> = []

  // 2) 각 멤버 순차 동기화
  for (const m of members) {
    const res = await callMemberSyncWithRetry(origin, m.id)

    const body = await res.json().catch(() => ({}))

    results.push({
      memberId: m.id,
      status: res.status,
      ok: res.ok,
      message: body.message ?? body.error ?? null,
    })

    // 멤버 간 기본 딜레이
    if (MEMBER_DELAY_MS > 0) {
      await sleep(MEMBER_DELAY_MS)
    }
  }

  return NextResponse.json({
    totalMembers: members.length,
    processed: results.length,
    results,
  })
}
