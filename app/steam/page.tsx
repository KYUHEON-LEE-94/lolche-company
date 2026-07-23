import type { Metadata } from 'next'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import SteamLinkForm from '@/app/steam/SteamLinkForm'
import SharedWithMe from '@/app/steam/SharedWithMe'

// ⚠ 이 페이지는 DB 캐시(steam_owned_games / steam_apps)만 읽는다.
//   Steam API 호출은 /api/admin/sync-steam(크론)과 스팀 최초 등록 시점에서만 일어난다.
//
// ⚠⚠ 이 파일에서 세션을 읽지 않는다 (cookies() / createRouteClient() / auth.getUser() 금지).
//     revalidate 는 경로 단위 공유 캐시라, 서버에서 개인화하면 A가 만든 HTML이 B에게 서빙된다.
//     개인화("나와 같은 게임")는 SharedWithMe(Client) → force-dynamic API 경로로만 흐른다.
export const revalidate = 300

export const metadata: Metadata = {
  title: '스팀 · 롤토 컴퍼니',
}

const STEAM_VISIBILITY_PUBLIC = 3
/** Supabase(PostgREST) 기본 응답 상한. 이 크기로 끊어서 전부 가져온다. */
const PAGE_SIZE = 1000
const MAX_PAGES = 20

type SteamMemberRow = {
  id: string
  member_name: string
  profile_image_path: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_synced_at: string | null
}

type OwnedRow = {
  member_id: string
  appid: number
  playtime_forever: number
  playtime_2weeks: number
  steam_apps: { appid: number; name: string | null; is_multiplayer: boolean | null } | null
}

type LoadResult =
  | { ok: true; members: SteamMemberRow[]; owned: OwnedRow[] }
  | { ok: false; message: string }

function capsuleUrl(appid: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`
}

function formatHours(minutes: number) {
  const hours = minutes / 60
  if (hours >= 100) return `${Math.round(hours).toLocaleString('ko-KR')}시간`
  if (hours >= 10) return `${hours.toFixed(0)}시간`
  if (hours >= 1) return `${hours.toFixed(1)}시간`
  return `${minutes}분`
}

function formatSyncedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date)
}

function getProfileImageUrl(path: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${path}`
}

/**
 * 마이그레이션 미실행(컬럼/테이블 부재) 시에도 500 대신 안내로 degrade 하기 위해
 * 에러를 throw 하지 않고 결과 객체로 돌려준다.
 */
async function loadSteamData(): Promise<LoadResult> {
  const membersResult = await supabase
    .from('members')
    .select(
      'id,member_name,profile_image_path,steam_avatar_url,steam_visibility,steam_synced_at',
    )
    // 승인 대기/거절 멤버는 노출하지 않는다 (CLAUDE.md 노출 필터 규칙)
    .eq('status', 'approved')
    .not('steam_id64', 'is', null)
    .order('member_name', { ascending: true })

  if (membersResult.error) {
    console.error('[steam] members 조회 실패', membersResult.error.message)
    return { ok: false, message: membersResult.error.message }
  }

  const members = (membersResult.data ?? []) as SteamMemberRow[]
  if (members.length === 0) return { ok: true, members: [], owned: [] }

  const memberIds = members.map((m) => m.id)
  const owned: OwnedRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('steam_owned_games')
      .select(
        'member_id,appid,playtime_forever,playtime_2weeks,steam_apps!inner(appid,name,is_multiplayer)',
      )
      .in('member_id', memberIds)
      .order('appid', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('[steam] steam_owned_games 조회 실패', error.message)
      return { ok: false, message: error.message }
    }

    const rows = (data ?? []) as unknown as OwnedRow[]
    owned.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return { ok: true, members, owned }
}

type SharedGame = {
  appid: number
  name: string
  isMultiplayer: boolean | null
  ownerNames: string[]
}

function buildSharedGames(members: SteamMemberRow[], owned: OwnedRow[]): SharedGame[] {
  const nameById = new Map(members.map((m) => [m.id, m.member_name]))
  const byApp = new Map<number, SharedGame>()

  for (const row of owned) {
    // 싱글플레이로 확정된 게임만 제외한다. 미확인(null)은 남겨 "분류 미확인" 으로 표기.
    if (row.steam_apps?.is_multiplayer === false) continue

    const memberName = nameById.get(row.member_id)
    if (!memberName) continue

    const existing = byApp.get(row.appid)
    if (existing) {
      existing.ownerNames.push(memberName)
      continue
    }
    byApp.set(row.appid, {
      appid: row.appid,
      name: row.steam_apps?.name ?? `앱 ${row.appid}`,
      isMultiplayer: row.steam_apps?.is_multiplayer ?? null,
      ownerNames: [memberName],
    })
  }

  return [...byApp.values()]
    .filter((g) => g.ownerNames.length >= 2)
    .sort((a, b) => b.ownerNames.length - a.ownerNames.length || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 24)
}

type MemberStat = {
  member: SteamMemberRow
  recentMinutes: number
  recentGames: { appid: number; name: string; minutes: number }[]
}

function buildMemberStats(members: SteamMemberRow[], owned: OwnedRow[]): MemberStat[] {
  const stats = new Map<string, MemberStat>(
    members.map((m) => [m.id, { member: m, recentMinutes: 0, recentGames: [] }]),
  )

  for (const row of owned) {
    const stat = stats.get(row.member_id)
    if (!stat) continue
    if (row.playtime_2weeks > 0) {
      stat.recentMinutes += row.playtime_2weeks
      stat.recentGames.push({
        appid: row.appid,
        name: row.steam_apps?.name ?? `앱 ${row.appid}`,
        minutes: row.playtime_2weeks,
      })
    }
  }

  for (const stat of stats.values()) {
    stat.recentGames.sort((a, b) => b.minutes - a.minutes)
    stat.recentGames = stat.recentGames.slice(0, 3)
  }

  return [...stats.values()]
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-black text-white">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-6 py-10 text-center text-sm text-slate-400">
      {children}
    </div>
  )
}

export default async function SteamPage() {
  const result = await loadSteamData()

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#07090f] px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-3">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-emerald-500/50" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">
              Steam
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">스팀</h1>
          <p className="mt-2 text-sm text-slate-400">
            나와 겹치는 게임, 멤버들이 함께 할 수 있는 게임과 최근 플레이 기록을 모았습니다.
          </p>
        </header>

        <div className="mb-10">
          <SteamLinkForm />
        </div>

        {/* 개인화 섹션. 이 컴포넌트의 실패는 아래 공통 섹션에 영향을 주지 않는다. */}
        <div className="mb-12">
          <SharedWithMe />
        </div>

        {!result.ok ? (
          <EmptyBox>스팀 데이터를 아직 사용할 수 없습니다. 잠시 후 다시 확인해주세요.</EmptyBox>
        ) : (
          <SteamSections members={result.members} owned={result.owned} />
        )}
      </div>
    </main>
  )
}

function SteamSections({ members, owned }: { members: SteamMemberRow[]; owned: OwnedRow[] }) {
  if (members.length === 0) {
    return <EmptyBox>아직 스팀 계정을 연결한 멤버가 없습니다.</EmptyBox>
  }

  const sharedGames = buildSharedGames(members, owned)
  const stats = buildMemberStats(members, owned)

  const recentPlayers = stats
    .filter((s) => s.recentMinutes > 0)
    .sort((a, b) => b.recentMinutes - a.recentMinutes)
  const privateMembers = members.filter(
    (m) => m.steam_visibility != null && m.steam_visibility !== STEAM_VISIBILITY_PUBLIC,
  )
  const lastSyncedAt = members
    .map((m) => m.steam_synced_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)

  return (
    <div className="space-y-12">
      <section>
        <SectionHeading
          title="함께 할 수 있는 게임"
          hint="2명 이상이 보유한 멀티플레이 게임입니다."
        />
        {sharedGames.length === 0 ? (
          <EmptyBox>아직 함께 보유한 멀티플레이 게임이 없습니다.</EmptyBox>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sharedGames.map((game) => (
              <li
                key={game.appid}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 transition-colors hover:border-white/20"
              >
                <div className="relative h-[42px] w-[110px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]">
                  <Image
                    src={capsuleUrl(game.appid)}
                    alt=""
                    fill
                    sizes="110px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-white">{game.name}</p>
                    {game.isMultiplayer === null && (
                      <span className="shrink-0 rounded-md border border-white/10 bg-slate-700/40 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                        분류 미확인
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {game.ownerNames.length}명 보유 · {game.ownerNames.join(', ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading title="최근 2주 플레이" hint="스팀 기준 최근 2주간 플레이 시간입니다." />
        {recentPlayers.length === 0 ? (
          <EmptyBox>최근 2주간 플레이 기록이 없습니다.</EmptyBox>
        ) : (
          <ul className="space-y-2">
            {recentPlayers.map((stat) => (
              <li
                key={stat.member.id}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
              >
                <MemberAvatar member={stat.member} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{stat.member.member_name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {stat.recentGames.map((g) => `${g.name} ${formatHours(g.minutes)}`).join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-black text-emerald-300">
                  {formatHours(stat.recentMinutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {privateMembers.length > 0 && (
        <p className="text-[11px] text-amber-300/80">
          프로필 비공개 — 게임 데이터가 표시되지 않습니다:{' '}
          {privateMembers.map((m) => m.member_name).join(', ')}
        </p>
      )}

      <p className="text-[11px] text-slate-600">
        마지막 동기화 {formatSyncedAt(lastSyncedAt ?? null) ?? '기록 없음'}
      </p>
    </div>
  )
}

function MemberAvatar({ member }: { member: SteamMemberRow }) {
  const imageUrl = member.steam_avatar_url ?? getProfileImageUrl(member.profile_image_path)
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06]">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm text-slate-500">
          {member.member_name.slice(0, 1)}
        </span>
      )}
    </div>
  )
}

