// types/supabase.ts

// 실제 DB 컬럼이랑 맞춰줘야 해 (nullable 여부도)
export type Member = {
    id: string
    member_name: string
    riot_game_name: string
    riot_tagline: string
    riot_puuid: string | null
    tft_summoner_id: string | null
    tft_tier: string | null
    tft_rank: string | null
    tft_league_points: number | null
    tft_wins: number | null
    tft_losses: number | null
    created_at: string
    last_synced_at: string | null
    memo: string | null
  }
  
  export type Admin = {
    user_id: string
    display_name: string | null
    is_super_admin: boolean | null
    created_at: string
  }
  
  export type TftMatch = {
    match_id: string
    data_version: string | null
    game_datetime: string | null
    queue_id: number | null
    tft_set_number: number | null
    game_length_seconds: number | null
  }
  
  export type TftMatchParticipant = {
    id: number
    match_id: string
    member_id: string | null
    puuid: string
    placement: number | null
    level: number | null
    time_eliminated: number | null
    total_damage_to_players: number | null
    augments: any | null
    traits: any | null
    units: any | null
  }
  