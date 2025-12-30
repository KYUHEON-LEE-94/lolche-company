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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}


