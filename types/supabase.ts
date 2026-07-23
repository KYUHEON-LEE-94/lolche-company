export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MemberStatus = 'pending' | 'approved' | 'rejected'

export type Member = {
  id: string
  user_id: string | null
  discord_id: string | null
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

  // LoL 솔로랭크 (20260724_lol_rank.sql)
  // ⚠ riot_accounts 도입(20260726) 이후 tft_* / lol_* / riot_* 는 전부
  //    "대표 계정 값의 비정규화 캐시"다. 갱신은 lib/members/primaryAccount.ts 한 곳에서만 한다.
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  lol_wins: number | null
  lol_losses: number | null
  lol_synced_at: string | null

  // 스팀 연동 (20260724_steam.sql)
  // steam_visibility 는 GetPlayerSummaries 의 communityvisibilitystate 원값 (3 = 공개)
  steam_id64: string | null
  steam_persona: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_linked_at: string | null
  steam_synced_at: string | null
  steam_sync_error: string | null

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

  // 자가 등록 승인 워크플로 (20260723_member_self_registration.sql)
  status: MemberStatus
  requested_at: string | null
  approved_at: string | null
  approved_by: string | null
  rejected_reason: string | null
}

/**
 * 라이엇 계정 (20260726_riot_accounts.sql) — 멤버당 최대 3행.
 * `members`는 "사람" 단위 1행을 유지하고, 이 테이블이 "계정" 축을 담당한다.
 * 대표 계정은 `is_primary desc, account_no asc` 정렬의 첫 행으로 파생한다
 * (`is_primary`가 전부 false여도 대표 없음 상태가 관측되지 않는다).
 */
export type RiotAccount = {
  id: string
  member_id: string
  /** 1~3. 최대 개수를 물리적으로 강제하는 슬롯 번호 (unique(member_id, account_no)) */
  account_no: number
  is_primary: boolean

  riot_game_name: string
  riot_tagline: string
  riot_puuid: string | null

  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_wins: number | null
  tft_losses: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_league_points: number | null
  tft_doubleup_wins: number | null
  tft_doubleup_losses: number | null

  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  lol_wins: number | null
  lol_losses: number | null
  lol_synced_at: string | null

  last_synced_at: string | null
  created_at: string
}

export type Admin = {
  // (A)안 마이그레이션 적용 시 대리 PK. 미적용 스키마에서도 select 대상이 아니면 무해하다.
  id: string
  user_id: string | null
  discord_id: string | null
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

// --- 스팀 (20260724_steam.sql) ---
export type SteamApp = {
  appid: number
  name: string | null
  /** true=멀티, false=싱글, null=미확인(store API 미조회/실패) */
  is_multiplayer: boolean | null
  category_ids: number[] | null
  details_checked_at: string | null
  created_at: string
}

export type SteamOwnedGame = {
  member_id: string
  appid: number
  /** 분 단위 */
  playtime_forever: number
  /** 분 단위 (최근 2주) */
  playtime_2weeks: number
  updated_at: string
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
  queue_type: string | null
  tier: string | null
  rank: string | null
  lp: number | null
  wins: number | null
  recorded_at: string | null
  // 멤버 추방 후에도 기록이 남도록 아카이브 시점의 이름/이미지를 보존한다.
  member_name_snapshot: string | null
  profile_image_snapshot: string | null
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
  season_id: number | null
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
/** 게임 종류. `game_type`(solo/team)과는 다른 축이므로 절대 합치지 않는다. */
export type CustomGameKind = 'tft' | 'lol' | 'steam' | 'etc'
export type CustomGameStatus = 'recruiting' | 'in_progress' | 'ended' | 'cancelled'

export type CustomGame = {
  id: string
  title: string
  status: string // CustomGameStatus
  game_type: string // 'solo' | 'team' — game_kind='tft'일 때만 의미가 있다
  game_kind: string // CustomGameKind
  game_kind_label: string | null // game_kind='etc'일 때만 값이 있다
  host_member_id: string | null // 주최자 추방 시 null (FK on delete set null)
  scheduled_at: string | null
  capacity: number
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
      riot_accounts: {
        Row: RiotAccount
        Insert: Optional<Omit<RiotAccount, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
          member_id: string
          account_no: number
          riot_game_name: string
          riot_tagline: string
        }
        Update: Optional<RiotAccount>
      }
      admins: {
        Row: Admin
        Insert: Optional<Admin> & {
          id?: string
          user_id?: string | null
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
      steam_apps: {
        Row: SteamApp
        Insert: Optional<Omit<SteamApp, 'appid' | 'created_at'>> & {
          appid: number
          created_at?: string
        }
        Update: Optional<SteamApp>
      }
      steam_owned_games: {
        Row: SteamOwnedGame
        Insert: Optional<Omit<SteamOwnedGame, 'member_id' | 'appid' | 'updated_at'>> & {
          member_id: string
          appid: number
          updated_at?: string
        }
        Update: Optional<SteamOwnedGame>
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
    Views: {
      /** distinct on (member_id) — is_primary desc, account_no asc */
      member_primary_account: {
        Row: RiotAccount
      }
    }
    Functions: {
      /** 대표 계정 전환. p_member_id 가드가 있어 타인 계정은 전환되지 않는다. */
      set_primary_riot_account: {
        Args: { p_member_id: string; p_account_id: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}


