import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const ADMIN_SYNC_TOKEN = process.env.ADMIN_SYNC_TOKEN

// 한번에 처리할 멤버 수
const MAX_MEMBERS_PER_RUN = Number(process.env.SYNC_BATCH_SIZE ?? 2)

// 멤버 간 API 호출 딜레이(ms)
const MEMBER_SYNC_DELAY_MS = Number(process.env.MEMBER_SYNC_DELAY_MS ?? 1500)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(req: Request) {
  // ----- 토큰 검사 -----
  const headerToken = req.headers.get('x-admin-sync-token')
  if (!ADMIN_SYNC_TOKEN || headerToken !== ADMIN_SYNC_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ----- last_synced_at 오래된 순으로 멤버 가져오기 -----
  const { data: members, error } = await supabase
  .from('members')
  .select('id, member_name, last_synced_at')
  .order('last_synced_at', { ascending: true, nullsFirst: true })
  .limit(MAX_MEMBERS_PER_RUN)

  if (error) {
    console.error(error)
    return NextResponse.json(
        { error: 'Failed to load members' },
        { status: 500 }
    )
  }

  if (!members || members.length === 0) {
    return NextResponse.json({
      message: 'No members to sync (all up to date)',
    })
  }

  const results: any[] = []

  // ----- 순차적 동기화 -----
  for (const m of members) {
    try {
      console.log(`[sync-all] Syncing member → ${m.id} (${m.member_name})`)

      // sync route 호출
      const res = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL}/api/members/${m.id}/sync`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-sync-token': ADMIN_SYNC_TOKEN, // 옵션: sync API도 보호하고 싶을 때
            },
          }
      )

      const body = await res.json().catch(() => ({}))

      results.push({
        memberId: m.id,
        httpStatus: res.status,
        body,
      })

      // 멤버 사이에 짧은 딜레이 (레이트 리밋 보호)
      await sleep(MEMBER_SYNC_DELAY_MS)
    } catch (e) {
      console.error(e)
      results.push({
        memberId: m.id,
        httpStatus: 500,
        error: 'sync failed',
      })
    }
  }

  return NextResponse.json({
    message: 'sync-all finished',
    processed: results.length,
    members: results,
  })
}
