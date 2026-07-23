import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMember } from '@/lib/members/approved'
import { getKrMaps, toKrChampionName, getUnitImageUrl } from '@/lib/tft/tftLocale'

type Ctx = { params: Promise<{ id: string }> }

const QUEUE_ID: Record<string, number> = {
  solo: 1100,
  doubleup: 1160,
}

const MATCH_SAMPLE = 100
const RECENT_FORM = 10
const TOP_UNITS = 8

type RawUnit = { character_id?: string }

type ParticipantRow = { placement: number | null; units: unknown }
type MatchRow = { tft_match_participants: ParticipantRow[] }

export async function GET(req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params

  if (!(await isApprovedMember(memberId))) {
    return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const queueId = QUEUE_ID[searchParams.get('queue') ?? 'solo']

  // 정렬 기준(game_datetime)이 tft_matches 에 있으므로 매치 테이블을 루트로 둔다.
  // 임베디드(to-one) 컬럼 기준 정렬은 PostgREST 가 지원하지 않는다.
  let q = supabaseAdmin
    .from('tft_matches')
    .select('tft_match_participants!inner(placement, units)')
    .eq('tft_match_participants.member_id', memberId)
    .order('game_datetime', { ascending: false })
    .limit(MATCH_SAMPLE)

  if (queueId !== undefined) {
    q = q.eq('queue_id', queueId)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = ((data ?? []) as unknown as MatchRow[])
    .map((m) => m.tft_match_participants[0])
    .filter(
      (r): r is ParticipantRow =>
        !!r && typeof r.placement === 'number' && r.placement >= 1 && r.placement <= 8,
    )

  const total = rows.length

  if (total === 0) {
    return NextResponse.json({
      total: 0,
      avgPlacement: null,
      top4Rate: 0,
      winRate: 0,
      distribution: [0, 0, 0, 0, 0, 0, 0, 0],
      recentForm: [],
      topUnits: [],
    })
  }

  const distribution = [0, 0, 0, 0, 0, 0, 0, 0]
  let sum = 0
  for (const r of rows) {
    const p = r.placement as number
    distribution[p - 1] += 1
    sum += p
  }

  const top4 = distribution[0] + distribution[1] + distribution[2] + distribution[3]

  // units JSON 은 매치당 8~10개다. 원본을 클라이언트로 내보내지 않고 여기서 집계한다.
  const unitAgg = new Map<string, { count: number; placementSum: number }>()
  for (const r of rows) {
    if (!Array.isArray(r.units)) continue
    const seen = new Set<string>()
    for (const u of r.units as RawUnit[]) {
      const cid = u?.character_id
      if (!cid || seen.has(cid)) continue
      seen.add(cid)
      const cur = unitAgg.get(cid) ?? { count: 0, placementSum: 0 }
      cur.count += 1
      cur.placementSum += r.placement as number
      unitAgg.set(cid, cur)
    }
  }

  const krMaps = await getKrMaps()
  const topUnits = [...unitAgg.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].placementSum / a[1].count - b[1].placementSum / b[1].count)
    .slice(0, TOP_UNITS)
    .map(([characterId, agg]) => ({
      character_id: characterId,
      name: toKrChampionName(characterId, krMaps),
      imageUrl: getUnitImageUrl(characterId),
      count: agg.count,
      avgPlacement: Number((agg.placementSum / agg.count).toFixed(2)),
    }))

  return NextResponse.json({
    total,
    avgPlacement: Number((sum / total).toFixed(2)),
    top4Rate: Number(((top4 / total) * 100).toFixed(1)),
    winRate: Number(((distribution[0] / total) * 100).toFixed(1)),
    distribution,
    recentForm: rows.slice(0, RECENT_FORM).map((r) => r.placement as number),
    topUnits,
  })
}
