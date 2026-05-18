import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { SyncError } from '@/lib/sync/syncMember'
import {
  fetchPuuid,
  fetchTftLeaguesByPuuid,
  fetchMatchIdsByPuuid,
  fetchMatchById,
  RiotApiError,
} from '@/lib/riot/api'

const RIOT_MATCH_DETAIL_DELAY_MS = Number(process.env.RIOT_MATCH_DETAIL_DELAY_MS ?? '1200')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function doSyncMember(memberId: string) {
  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (memberError || !member) {
    throw new SyncError('Member not found', 404)
  }

  let puuid = member.riot_puuid
  if (!puuid) {
    puuid = await fetchPuuid(member.riot_game_name, member.riot_tagline)
  }

  let leagues: Awaited<ReturnType<typeof fetchTftLeaguesByPuuid>>
  try {
    leagues = await fetchTftLeaguesByPuuid(puuid!)
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 400) {
      puuid = await fetchPuuid(member.riot_game_name, member.riot_tagline)
      leagues = await fetchTftLeaguesByPuuid(puuid)
    } else {
      throw e
    }
  }

  const solo = leagues.find((e) => e.queueType === 'RANKED_TFT') ?? null
  const doubleUp = leagues.find((e) => e.queueType === 'RANKED_TFT_DOUBLE_UP') ?? null

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from('members')
    .update({
      riot_puuid: puuid ?? null,
      tft_tier: solo?.tier ?? null,
      tft_rank: solo?.rank ?? null,
      tft_league_points: solo?.leaguePoints ?? null,
      tft_wins: solo?.wins ?? null,
      tft_losses: solo?.losses ?? null,
      tft_doubleup_tier: doubleUp?.tier ?? null,
      tft_doubleup_rank: doubleUp?.rank ?? null,
      tft_doubleup_league_points: doubleUp?.leaguePoints ?? null,
      tft_doubleup_wins: doubleUp?.wins ?? null,
      tft_doubleup_losses: doubleUp?.losses ?? null,
    })
    .eq('id', memberId)
    .select('id')

  if (updateError) throw new SyncError(updateError.message, 500)
  if (!updatedRows || updatedRows.length === 0) {
    throw new SyncError('Update affected 0 rows. (RLS blocked or wrong id?)', 403)
  }

  const matchIds = await fetchMatchIdsByPuuid(puuid!)
  const recentPlacements: number[] = []

  for (const matchId of matchIds) {
    if (RIOT_MATCH_DETAIL_DELAY_MS > 0) await sleep(RIOT_MATCH_DETAIL_DELAY_MS)

    const match = await fetchMatchById(matchId)
    const { metadata, info } = match

    const matchRow = {
      match_id: metadata.match_id,
      data_version: metadata.data_version ?? null,
      game_datetime: info.game_datetime ? new Date(info.game_datetime).toISOString() : null,
      queue_id: info.queue_id ?? null,
      tft_set_number: info.tft_set_number ?? null,
      game_length_seconds: info.game_length != null ? Math.round(info.game_length) : null,
    }

    const { error: matchUpsertError } = await supabaseAdmin
      .from('tft_matches')
      .upsert([matchRow], { onConflict: 'match_id' })

    if (matchUpsertError) {
      console.error('tft_matches upsert error', matchUpsertError)
      continue
    }

    const myPart = info.participants.find((p) => p.puuid === puuid)
    if (!myPart) continue

    recentPlacements.push(myPart.placement ?? 8)

    await supabaseAdmin
      .from('tft_match_participants')
      .delete()
      .eq('match_id', metadata.match_id)
      .eq('member_id', memberId)

    const { error: partInsertError } = await supabaseAdmin
      .from('tft_match_participants')
      .insert([{
        match_id: metadata.match_id,
        member_id: memberId,
        puuid: puuid!,
        placement: myPart.placement ?? null,
        level: myPart.level ?? null,
        time_eliminated: myPart.time_eliminated ?? null,
        total_damage_to_players: myPart.total_damage_to_players ?? null,
        augments: myPart.augments ?? null,
        traits: myPart.traits ?? null,
        units: myPart.units ?? null,
      }])

    if (partInsertError) console.error('tft_match_participants insert error', partInsertError)
  }

  if (recentPlacements.length > 0) {
    const recent5 = recentPlacements.slice(0, 5).join(',')
    const { error: recentUpdateError } = await supabaseAdmin
      .from('members')
      .update({ tft_recent5: recent5 })
      .eq('id', memberId)

    if (recentUpdateError) console.error('members.tft_recent5 update error', recentUpdateError)
  }
}
