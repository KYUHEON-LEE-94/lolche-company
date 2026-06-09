import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getKrMaps, toKrAugmentName, toKrTraitName, toKrChampionName, getUnitImageUrl } from '@/lib/tft/tftLocale'

type Ctx = { params: Promise<{ id: string }> }

type RawUnit = {
  character_id?: string
  rarity?: number
  tier?: number
}

type ParticipantRow = {
  placement: number | null
  level: number | null
  augments: unknown
  traits: unknown
  units: unknown
  time_eliminated: number | null
}

type MatchRow = {
  match_id: string
  game_datetime: string | null
  game_length_seconds: number | null
  queue_id: number | null
  tft_match_participants: ParticipantRow[]
}

const QUEUE_ID: Record<string, number> = {
  solo: 1100,
  doubleup: 1160,
}

export async function GET(req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const queueParam = searchParams.get('queue') ?? 'solo'
  const queueId = QUEUE_ID[queueParam]

  // 단일 쿼리: tft_matches ↔ tft_match_participants 조인 (기존 3회 쿼리 → 1회)
  let q = supabaseAdmin
    .from('tft_matches')
    .select(`
      match_id,
      game_datetime,
      game_length_seconds,
      queue_id,
      tft_match_participants!inner(
        placement,
        level,
        augments,
        traits,
        units,
        time_eliminated
      )
    `)
    .eq('tft_match_participants.member_id', memberId)
    .order('game_datetime', { ascending: false })
    .limit(5)

  if (queueId !== undefined) {
    q = q.eq('queue_id', queueId)
  }

  const { data, error } = await q
  const matchRows = data as unknown as MatchRow[] | null

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!matchRows || matchRows.length === 0) return NextResponse.json({ matches: [] })

  const krMaps = await getKrMaps()

  const matches = matchRows.map((m) => {
    // !inner 조인으로 member_id가 필터됐으므로 [0]이 해당 멤버의 참가자 행
    const part = m.tft_match_participants[0] as ParticipantRow | undefined

    const rawAugments = Array.isArray(part?.augments) ? (part.augments as string[]) : null
    const translatedAugments = rawAugments?.map((id) => toKrAugmentName(id, krMaps)) ?? null

    const rawTraits = Array.isArray(part?.traits)
      ? (part.traits as Array<{ name: string } & Record<string, unknown>>)
      : null
    const translatedTraits = rawTraits?.map((t) => ({ ...t, name: toKrTraitName(t.name, krMaps) })) ?? null

    const rawUnits = Array.isArray(part?.units) ? (part.units as RawUnit[]) : []
    const translatedUnits = rawUnits
      .filter((u) => !!u.character_id)
      .sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || (b.tier ?? 0) - (a.tier ?? 0))
      .map((u) => ({
        character_id: u.character_id!,
        name: toKrChampionName(u.character_id!, krMaps),
        rarity: u.rarity ?? 0,
        tier: u.tier ?? 1,
        imageUrl: getUnitImageUrl(u.character_id!),
      }))

    return {
      match_id: m.match_id,
      game_datetime: m.game_datetime,
      game_length_seconds: m.game_length_seconds,
      queue_id: m.queue_id,
      placement: part?.placement ?? null,
      level: part?.level ?? null,
      time_eliminated: part?.time_eliminated ?? null,
      augments: translatedAugments,
      traits: translatedTraits,
      units: translatedUnits,
    }
  })

  return NextResponse.json({ matches })
}
