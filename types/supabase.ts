export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MemberStatus = 'pending' | 'approved' | 'rejected'
export type CalendarEventType = 'birthday' | 'anniversary' | 'event'
export type CalendarEventRecurrence = 'none' | 'yearly'

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  event_type: CalendarEventType
  recurrence: CalendarEventRecurrence
  event_date: string | null
  event_month: number
  event_day: number
  is_all_day: boolean
  event_time: string | null
  notification_sent_for: string | null
  member_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

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

  // 로그인 시 auth/callback 이 갱신한다 (20260729_discord_avatar.sql)
  discord_avatar_url: string | null

  profile_image_path: string | null
  profile_frame_path: string | null
  ranking_card_effect_key: string | null
  ranking_card_bg_image: string | null
  profile_card_theme_key: string | null
  profile_updated_at: string | null
  equipped_titles?: { id: string; label: string }[]

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
  /**
   * LoL 전용 키(RIOT_LOL_API_KEY)로 발급받은 PUUID (20260729_lol_puuid.sql).
   * PUUID 는 API 키에 종속된 암호문이라 riot_puuid(TFT 키 기준)와 값이 다르고,
   * 교차 사용하면 400 이 반환된다. 대표 계정만 lazy 로 채운다.
   * 컬럼 미적용 환경에서는 listRiotAccounts 가 null 로 채워 넣는다.
   */
  lol_puuid: string | null

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
  price_points: number
  is_purchasable: boolean
  created_by: string | null
  created_at: string
}

export type RankingCardEffect = { id:string; key:string; label:string; description:string|null; effect_key:string|null; image_path:string|null; price_points:number; is_active:boolean; is_purchasable:boolean; sort_order:number; created_at:string; created_by:string|null }
export type PointAccount = { member_id:string; balance:number; updated_at:string }
export type PointLedger = { id:number; member_id:string; amount:number; reason:'daily_login'|'custom_game_participation'|'cosmetic_purchase'|'admin_adjustment'|'hall_of_fame'; reference_key:string; description:string|null; balance_after:number; created_by:string|null; created_at:string }
export type MemberFrameInventory = { member_id:string; frame_id:string; purchased_at:string; price_paid:number }
export type MemberRankEffectInventory = { member_id:string; effect_id:string; purchased_at:string; price_paid:number }

// --- 스팀 (20260724_steam.sql) ---
export type SteamApp = {
  appid: number
  name: string | null
  /** true=멀티, false=싱글, null=미확인(store API 미조회/실패) */
  is_multiplayer: boolean | null
  category_ids: number[] | null
  details_checked_at: string | null
  header_image_url: string | null
  header_image_checked_at: string | null
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

export type SteamFeaturedDealSnapshot = {
  id: boolean
  deals: Json
  last_success_at: string | null
  lock_token: string | null
  lock_expires_at: string | null
  updated_at: string
}

export type CalendarSystemEvent = {
  id: string
  source: 'tft_patch_note' | 'steam_deal'
  source_key: string
  title: string
  description: string | null
  href: string
  event_date: string
  event_time: string | null
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
  scheduled_end_at: string | null
  end_reminder_sent_at: string | null
  created_at: string
}

export type TftPatchNote = {
  id: string
  season_id: number
  title: string
  summary: string
  content: string
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  source_key: string | null
  source_url: string | null
  source_published_at: string | null
}

export type TftPatchNoteSyncState = {
  id: boolean
  last_success_at: string | null
  lock_token: string | null
  lock_expires_at: string | null
  updated_at: string
}

export type LolPatchNote = {
  id: string
  title: string
  summary: string
  source_key: string
  source_url: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export type LolPatchNoteSyncState = {
  id: boolean
  last_success_at: string | null
  lock_token: string | null
  lock_expires_at: string | null
  updated_at: string
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
  discord_avatar_snapshot: string | null
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

export type ProfileCardTheme = { id: string; key: string; label: string; description: string; price_points: number; is_active: boolean; is_purchasable: boolean; sort_order: number; created_at: string }

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
  game_kind_label: string | null // 'etc'는 필수, 'steam'은 선택. 그 외는 항상 null
  steam_app_id: number | null // game_kind='steam' 전용. 캡슐 이미지 표시용 스냅샷 (FK 없음)
  lol_mode: string | null // 'aram' | 'rift' — game_kind='lol' 전용. 그 외는 항상 null
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
  guest_name: string | null // 롤 외부인 자유 텍스트 라벨(FK 없음). member_id/guest_id 와 상호배타
  position: string | null // 협곡 포지션 슬롯(top/jungle/mid/adc/support). 증바람·TFT는 null
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
        Relationships: []
        Update: Optional<Member>
      }
      calendar_events: {
        Row: CalendarEvent
        Insert: Optional<Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>> & {
          id?: string
          created_at?: string
          updated_at?: string
          title: string
          event_type: CalendarEventType
          recurrence: CalendarEventRecurrence
          event_month: number
          event_day: number
          member_id: string
        }
        Relationships: []
        Update: Optional<CalendarEvent>
      }
      calendar_system_events: {
        Row: CalendarSystemEvent
        Insert: Optional<Omit<CalendarSystemEvent, 'id' | 'created_at' | 'event_date'>> & { id?: string; created_at?: string; event_date?: string }
        Update: Optional<CalendarSystemEvent>
        Relationships: []
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
        Relationships: []
        Update: Optional<RiotAccount>
      }
      admins: {
        Row: Admin
        Insert: Optional<Admin> & {
          id?: string
          user_id?: string | null
          created_at?: string
        }
        Relationships: []
        Update: Optional<Admin>
      }
      tft_matches: {
        Row: TftMatch
        Insert: Optional<TftMatch> & {
          match_id?: string
        }
        Relationships: []
        Update: Optional<TftMatch>
      }
      tft_match_participants: {
        Row: TftMatchParticipant
        Insert: Optional<TftMatchParticipant> & {
          id?: number
        }
        Relationships: []
        Update: Optional<TftMatchParticipant>
      }
      profile_frames: {
        Row: ProfileFrame
        Insert: Optional<Omit<ProfileFrame, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Relationships: []
        Update: Optional<ProfileFrame>
      }
      point_accounts: { Row: PointAccount; Insert: Optional<PointAccount> & { member_id:string }; Update: Optional<PointAccount>; Relationships: [] }
      point_ledger: { Row: PointLedger; Insert: Optional<Omit<PointLedger,'id'|'created_at'>> & { member_id:string; amount:number; reason:PointLedger['reason']; reference_key:string; balance_after:number }; Update: Optional<PointLedger>; Relationships: [] }
      ranking_card_effects: { Row: RankingCardEffect; Insert: Optional<Omit<RankingCardEffect,'id'|'created_at'>> & { key:string; label:string; price_points:number }; Update: Optional<RankingCardEffect>; Relationships: [] }
      member_frame_inventory: { Row: MemberFrameInventory; Insert: Optional<MemberFrameInventory> & { member_id:string; frame_id:string; price_paid:number }; Update: Optional<MemberFrameInventory>; Relationships: [] }
      member_rank_effect_inventory: { Row: MemberRankEffectInventory; Insert: Optional<MemberRankEffectInventory> & { member_id:string; effect_id:string; price_paid:number }; Update: Optional<MemberRankEffectInventory>; Relationships: [] }
      profile_card_themes: { Row: ProfileCardTheme; Insert: Optional<Omit<ProfileCardTheme,'id'|'created_at'>> & { id?:string; created_at?:string; key:string; label:string; price_points:number }; Update: Optional<ProfileCardTheme>; Relationships: [] }
      member_profile_theme_inventory: { Row: { member_id:string; theme_id:string; price_paid:number; created_at:string }; Insert: { member_id:string; theme_id:string; price_paid:number }; Update: { price_paid?:number }; Relationships: [] }
      seasons: {
        Row: Season
        Insert: Optional<Omit<Season, 'id' | 'created_at'>> & {
          id?: number
          created_at?: string
        }
        Relationships: []
        Update: Optional<Season>
      }
      tft_patch_notes: {
        Row: TftPatchNote
        Insert: Optional<Omit<TftPatchNote, 'id' | 'created_at' | 'updated_at'>> & { id?: string; created_at?: string; updated_at?: string; season_id: number; title: string; content: string }
        Relationships: []
        Update: Optional<TftPatchNote>
      }
      tft_patch_note_sync_state: {
        Row: TftPatchNoteSyncState
        Insert: Optional<TftPatchNoteSyncState> & { id?: boolean }
        Update: Optional<TftPatchNoteSyncState>
        Relationships: []
      }
      lol_patch_notes: {
        Row: LolPatchNote
        Insert: Optional<Omit<LolPatchNote, 'id' | 'created_at' | 'updated_at'>> & { id?: string; created_at?: string; updated_at?: string; title: string; source_key: string; source_url: string }
        Relationships: []
        Update: Optional<LolPatchNote>
      }
      lol_patch_note_sync_state: {
        Row: LolPatchNoteSyncState
        Insert: Optional<LolPatchNoteSyncState> & { id?: boolean }
        Update: Optional<LolPatchNoteSyncState>
        Relationships: []
      }
      // --- 신규 테이블 추가: hall_of_fame ---
      hall_of_fame: {
        Row: HallOfFame
        Insert: Optional<Omit<HallOfFame, 'id' | 'recorded_at'>> & {
          id?: string
          recorded_at?: string
        }
        Relationships: []
        Update: Optional<HallOfFame>
      }
      member_rank_history: {
        Row: MemberRankHistory
        Insert: Optional<Omit<MemberRankHistory, 'id' | 'recorded_at'>> & {
          id?: string
          recorded_at?: string
        }
        Relationships: []
        Update: Optional<MemberRankHistory>
      }
      sync_logs: {
        Row: SyncLog
        Insert: Optional<Omit<SyncLog, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Relationships: []
        Update: Optional<SyncLog>
      }
      steam_apps: {
        Row: SteamApp
        Insert: Optional<Omit<SteamApp, 'appid' | 'created_at'>> & {
          appid: number
          created_at?: string
        }
        Relationships: []
        Update: Optional<SteamApp>
      }
      steam_owned_games: {
        Row: SteamOwnedGame
        Insert: Optional<Omit<SteamOwnedGame, 'member_id' | 'appid' | 'updated_at'>> & {
          member_id: string
          appid: number
          updated_at?: string
        }
        Relationships: []
        Update: Optional<SteamOwnedGame>
      }
      steam_featured_deal_snapshots: {
        Row: SteamFeaturedDealSnapshot
        Insert: Optional<SteamFeaturedDealSnapshot> & { id?: boolean }
        Relationships: []
        Update: Optional<SteamFeaturedDealSnapshot>
      }
      // --- 내전 테이블 ---
      custom_games: {
        Row: CustomGame
        Insert: Optional<Omit<CustomGame, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Relationships: []
        Update: Optional<CustomGame>
      }
      custom_game_participants: {
        Row: CustomGameParticipant
        Insert: Optional<Omit<CustomGameParticipant, 'id' | 'joined_at'>> & {
          id?: string
          joined_at?: string
        }
        Relationships: []
        Update: Optional<CustomGameParticipant>
      }
      custom_game_rounds: {
        Row: CustomGameRound
        Insert: Optional<Omit<CustomGameRound, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Relationships: []
        Update: Optional<CustomGameRound>
      }
      custom_game_results: {
        Row: CustomGameResult
        Insert: Optional<Omit<CustomGameResult, 'id'>> & { id?: string }
        Relationships: []
        Update: Optional<CustomGameResult>
      }
      custom_game_guests: {
        Row: CustomGameGuest
        Insert: Optional<Omit<CustomGameGuest, 'id' | 'joined_at'>> & {
          id?: string
          joined_at?: string
        }
        Relationships: []
        Update: Optional<CustomGameGuest>
      }
      custom_game_guest_results: {
        Row: CustomGameGuestResult
        Insert: Optional<Omit<CustomGameGuestResult, 'id'>> & { id?: string }
        Relationships: []
        Update: Optional<CustomGameGuestResult>
      }
      custom_game_teams: {
        Row: CustomGameTeam
        Insert: Optional<Omit<CustomGameTeam, 'id' | 'created_at'>> & {
          id?: string
          created_at?: string
        }
        Relationships: []
        Update: Optional<CustomGameTeam>
      }
    }
    Views: {
      /** distinct on (member_id) — is_primary desc, account_no asc */
      member_primary_account: {
         Relationships: []
        Row: RiotAccount
      }
    }
    Functions: {
      /** 대표 계정 전환. p_member_id 가드가 있어 타인 계정은 전환되지 않는다. */
      set_primary_riot_account: {
        Args: { p_member_id: string; p_account_id: string }
        Returns: undefined
      }
      rollover_tft_season: {
        Args: {
          p_current_season_id: number
          p_confirmation: string
          p_next_season_name: string
          p_next_set_number: number
          p_start_at: string
        }
        Returns: {
          status: 'completed' | 'already_completed'
          previous_season_id: number
          next_season_id: number
          next_season_name: string
          solo_count: number
          doubleup_count: number
          awarded_count?: number
        }
      }
      end_custom_game_and_award_points: {
        Args: { p_game_id: string }
        Returns: { status: 'completed'|'already_ended'|'invalid_status'|'not_found'; confirmed_count:number; awarded_count:number; already_awarded_count:number; ended_at:string|null }[]
      }
      grant_member_points: {
        Args: { p_member_id:string; p_amount:number; p_request_id:string; p_actor_user_id:string; p_description:string }
        Returns: { status:'granted'|'already_applied'|'request_conflict'|'forbidden'|'invalid_amount'|'invalid_description'|'not_found'; balance:number }[]
      }
      claim_tft_patch_note_sync: {
        Args: { p_lock_token: string; p_min_interval_seconds: number }
        Returns: { status: 'claimed' | 'locked' | 'cooldown'; retry_after_seconds: number }[]
      }
      finish_tft_patch_note_sync: {
        Args: { p_lock_token: string; p_success: boolean }
        Returns: { status: 'finished' | 'not_owner'; last_success_at: string | null }[]
      }
      claim_lol_patch_note_sync: {
        Args: { p_lock_token: string; p_min_interval_seconds: number }
        Returns: { status: 'claimed' | 'locked' | 'cooldown'; retry_after_seconds: number }[]
      }
      finish_lol_patch_note_sync: {
        Args: { p_lock_token: string; p_success: boolean }
        Returns: { status: 'finished' | 'not_owner'; last_success_at: string | null }[]
      }
      claim_steam_featured_deal_sync: {
        Args: { p_lock_token: string }
        Returns: { status: 'claimed' | 'locked'; retry_after_seconds: number }[]
      }
      finish_steam_featured_deal_sync: {
        Args: { p_lock_token: string; p_success: boolean }
        Returns: { status: 'finished' | 'not_owner'; last_success_at: string | null }[]
      }
      replace_steam_featured_deal_snapshot: {
        Args: { p_lock_token: string; p_deals: Json }
        Returns: { status: 'replaced' | 'not_owner'; last_success_at: string | null }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
