// app/api/admin/sync-all/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const MEMBER_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '1500') // 멤버 간 대기(ms)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: Request) {
  // 1) 전체 멤버 조회 (필요하면 where 조건 추가 가능: last_synced_at 오래된 것만 등)
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

  const origin = new URL(req.url).origin
  const results: Array<{
    memberId: string
    status: number
    ok: boolean
    message?: string | null
  }> = []

  // 2) 각 멤버별로 순차 동기화
  for (const m of members) {
    const res = await fetch(`${origin}/api/members/${m.id}/sync`, {
      method: 'POST',
    })

    const body = await res.json().catch(() => ({}))

    results.push({
      memberId: m.id,
      status: res.status,
      ok: res.ok,
      message: body.message ?? body.error ?? null,
    })

    // Riot API rate limit 429가 떨어지면 더 이상 진행하지 않고 종료
    if (!res.ok && res.status === 429) {
      console.warn('Riot API rate limit에 걸려 전체 동기화 중단')
      break
    }

    // 다음 멤버로 넘어가기 전에 딜레이
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
