export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Member = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  riot_puuid: string | null
  tft_summoner_id: string | null
  tft_recent5: string | null

  // 솔로 TFT
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_wins: number | null
  tft_losses: number | null

  // 🔥 DOUBLE UP 추가
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_league_points: number | null
  tft_doubleup_wins: number | null
  tft_doubleup_losses: number | null

  profile_image_path: string | null
  profile_frame_path: string | null
  profile_updated_at: string | null

  created_at: string
  last_synced_at: string | null
  memo: string | null

  sync_status: string | null
  sync_attempts: number | null
  last_sync_started_at: string | null
  last_sync_finished_at: string | null
  last_sync_error: string | null

  tft_tier_prev: string | null
  tft_rank_prev: string | null
  tft_lp_prev: number | null
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
  augments: Json | null
  traits: Json | null
  units: Json | null
}

export type ProfileFrame = {
  id: string
  key: string
  label: string
  image_path: string
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
}

// --- 신규 타입 추가: Season ---
export type Season = {
  id: number
  set_number: number
  season_name: string
  is_active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
}

// --- 신규 타입 추가: HallOfFame ---
export type HallOfFame = {
  id: string
  season_id: number | null
  member_id: string | null
  tier: string | null
  rank: string | null
  lp: number | null
  wins: number | null
  recorded_at: string | null
}

export type MemberRankHistory = {
  id: string
  member_id: string
  tft_tier: string | null
  tft_rank: string | null
  tft_lp: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_lp: number | null
  recorded_at: string
}

export type SyncLog = {
  id: string
  type: string
  member_id: string | null
  status: string
  message: string | null
  duration_ms: number | null
  created_at: string
}

// --- 내전 ---
export type CustomGame = {
  id: string
  title: string
  status: string // 'in_progress' | 'ended'
  game_type: string // 'solo' | 'team'
  max_rounds: number
  created_at: string
  ended_at: string | null
}

export type CustomGameTeam = {
  id: string
  custom_game_id: string
  round_number: number
  team_index: number
  member_id: string | null
  guest_id: string | null
  created_at: string
}

export type CustomGameParticipant = {
  id: string
  custom_game_id: string
  member_id: string
  joined_at: string
}

export type CustomGameRound = {
  id: string
  custom_game_id: string
  round_number: number
  match_id: string
  played_at: string | null
  created_at: string
}

export type CustomGameResult = {
  id: string
  round_id: string
  member_id: string
  placement: number
  points: number
}

export type CustomGameGuest = {
  id: string
  custom_game_id: string
  display_name: string
  riot_puuid: string
  joined_at: string
}

export type CustomGameGuestResult = {
  id: string
  round_id: string
  guest_id: string
  placement: number
  points: number
}

export type TablesInsert<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Insert']

type Optional<T> = {
  [K in keyof T]?: T[K] | undefined
}

export interface Database {
  public: {
    Tables: {
      members: {
        Row: Member
        Insert: Optional<Omit<Member, 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Update: Optional<Member>
      }
      admins: {
        Row: Admin
        Insert: Optional<Admin> & {
          user_id?: string
          created_at?: string
        }
        Update: Optional<Admin>
      }
      tft_matches: {
        Row: TftMatch
        Insert: Optional<TftMatch> & {
          match_id?: string
        }
        Update: Optional<TftMatch>
      }
      tft_match_participants: {
        Row: TftMatchParticipant
        Insert: Optional<TftMatchParticipant> & {
          id?: number
        }
        Update: Optional<TftMatchParticipant>
      }
      profile_frames: {
        Row: ProfileFrame
        Insert: Optional<Omit<ProfileFrame, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Update: Optional<ProfileFrame>
      }
      seasons: {
        Row: Season
        Insert: Optional<Omit<Season, 'id' | 'created_at'>> & {
          id?: number
          created_at?: string
        }
        Update: Optional<Season>
      }
      // --- 신규 테이블 추가: hall_of_fame ---
      hall_of_fame: {
        Row: HallOfFame
        Insert: Optional<Omit<HallOfFame, 'id' | 'recorded_at'>> & {
          id?: string
          recorded_at?: string
        }
        Update: Optional<HallOfFame>
      }
      member_rank_history: {
        Row: MemberRankHistory
        Insert: Optional<Omit<MemberRankHistory, 'id' | 'recorded_at'>> & {
          id?: string
          recorded_at?: string
        }
        Update: Optional<MemberRankHistory>
      }
      sync_logs: {
        Row: SyncLog
        Insert: Optional<Omit<SyncLog, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Update: Optional<SyncLog>
      }
      // --- 내전 테이블 ---
      custom_games: {
        Row: CustomGame
        Insert: Optional<Omit<CustomGame, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Update: Optional<CustomGame>
      }
      custom_game_participants: {
        Row: CustomGameParticipant
        Insert: Optional<Omit<CustomGameParticipant, 'id' | 'joined_at'>> & {
          id?: string
          joined_at?: string
        }
        Update: Optional<CustomGameParticipant>
      }
      custom_game_rounds: {
        Row: CustomGameRound
        Insert: Optional<Omit<CustomGameRound, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Update: Optional<CustomGameRound>
      }
      custom_game_results: {
        Row: CustomGameResult
        Insert: Optional<Omit<CustomGameResult, 'id'>> & { id?: string }
        Update: Optional<CustomGameResult>
      }
      custom_game_guests: {
        Row: CustomGameGuest
        Insert: Optional<Omit<CustomGameGuest, 'id' | 'joined_at'>> & {
          id?: string
          joined_at?: string
        }
        Update: Optional<CustomGameGuest>
      }
      custom_game_guest_results: {
        Row: CustomGameGuestResult
        Insert: Optional<Omit<CustomGameGuestResult, 'id'>> & { id?: string }
        Update: Optional<CustomGameGuestResult>
      }
      custom_game_teams: {
        Row: CustomGameTeam
        Insert: Optional<Omit<CustomGameTeam, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Update: Optional<CustomGameTeam>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}


