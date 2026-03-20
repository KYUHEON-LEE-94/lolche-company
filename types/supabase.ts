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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}


