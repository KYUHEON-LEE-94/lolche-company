import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordAvatarUrl, getDiscordId, sanitizeNextPath } from '@/lib/auth/discord'
import { GUILD_GATE_ID } from '@/lib/constants/features'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type GuildCheck = { ok: true } | { ok: false; message: string }

/**
 * 게이트 ON(GUILD_GATE_ID 비어있지 않음)일 때만 호출된다.
 * OAuth 교환 직후 세션의 provider_token 으로 Discord 가입 서버 목록을 조회해
 * GUILD_GATE_ID 길드에 속했는지 확인한다.
 *
 * ⚠ 실제 강제 지점. provider_token 이 없거나(스코프 누락) 비멤버면 무조건 차단한다.
 *   네트워크/5xx 등 확인 자체가 실패하면 fail-closed 로 차단하되 재시도 가능 안내로 구분한다.
 *   토큰은 로그/에러 메시지에 절대 남기지 않는다.
 */
async function checkGuildMembership(providerToken: string | null | undefined): Promise<GuildCheck> {
    const blocked: GuildCheck = { ok: false, message: '이 디스코드 서버 멤버만 이용할 수 있어요.' }

    if (!providerToken) return blocked

    try {
        const res = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${providerToken}` },
        })

        // 4xx(권한/스코프 문제)는 비멤버로 간주해 차단, 5xx 는 재시도 가능 안내.
        if (!res.ok) {
            if (res.status >= 500) {
                return { ok: false, message: '로그인 확인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.' }
            }
            return blocked
        }

        const guilds: unknown = await res.json()
        if (!Array.isArray(guilds)) return blocked

        const isMember = guilds.some(
            (g) => g && typeof g === 'object' && (g as { id?: unknown }).id === GUILD_GATE_ID,
        )
        return isMember ? { ok: true } : blocked
    } catch (e) {
        // 네트워크 오류 등: fail-closed. 메시지에 토큰/URL 을 싣지 않는다.
        console.error('[auth/callback] 길드 확인 실패', e instanceof Error ? e.message : '오류 발생')
        return { ok: false, message: '로그인 확인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.' }
    }
}

/**
 * discord_id로 등록된 행에 로그인 계정(user_id)을 연결한다.
 * 이미 다른 user_id가 연결된 행은 계정 탈취 방지를 위해 절대 덮어쓰지 않는다.
 */
async function linkDiscordAccount(table: 'members' | 'admins', discordId: string, user: User) {
    const { data: row, error } = await supabaseService.schema('public')
        .from(table)
        .select('user_id')
        .eq('discord_id', discordId)
        .maybeSingle()

    if (error) {
        console.error(`[auth/callback] ${table} 조회 실패`, error.message)
        return
    }
    if (!row) return
    if (row.user_id === user.id) return
    if (row.user_id) {
        console.error(
            `[auth/callback] ${table}: discord_id=${discordId} 행에 이미 다른 user_id가 연결되어 있어 갱신하지 않음`,
        )
        return
    }

    const { error: updateError } = await supabaseService.schema('public')
        .from(table)
        .update({ user_id: user.id })
        .eq('discord_id', discordId)
        .is('user_id', null)

    if (updateError) {
        console.error(`[auth/callback] ${table} user_id 연결 실패`, updateError.message)
    }
}

/**
 * Discord 아바타를 members 에 반영한다.
 * 아바타는 사용자가 언제든 바꿀 수 있어 최초 1회만 저장하면 낡는다 — 로그인마다 갱신한다.
 *
 * ⚠ 계정 탈취 방지 가드 유지: `user_id = 세션 user` 인 행에만 쓴다.
 *   discord_id 만 같고 다른 user_id 가 연결된 행은 절대 건드리지 않는다.
 */
async function syncDiscordAvatar(discordId: string, user: User) {
    const avatarUrl = getDiscordAvatarUrl(user)
    if (!avatarUrl) return

    const { error } = await supabaseService.schema('public')
        .from('members')
        .update({ discord_avatar_url: avatarUrl })
        .eq('discord_id', discordId)
        .eq('user_id', user.id)

    // 마이그레이션(20260729) 미적용은 장애가 아니다 — 아바타 갱신만 건너뛴다.
    if (error && !isMissingColumnError(error)) {
        console.error('[auth/callback] discord_avatar_url 갱신 실패', error.message)
    }
}

/**
 * 이 사용자가 members 행에 연결돼 있는지 판정한다(최초 로그인 = 미등록 판별).
 * 계정 연결(linkDiscordAccount)이 먼저 돌았으므로 discord_id 사전 등록 행은 이미 user_id 가 채워졌다.
 * 그래도 남은 케이스(다른 계정 선점)는 계정 탈취 방지를 위해 "내 것"으로 보지 않는다.
 */
async function isRegisteredMember(user: User): Promise<boolean> {
    const { data: byUserId } = await supabaseService.schema('public')
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (byUserId) return true

    const discordId = getDiscordId(user)
    if (!discordId) return false

    const { data: byDiscord } = await supabaseService.schema('public')
        .from('members')
        .select('id, user_id')
        .eq('discord_id', discordId)
        .maybeSingle()

    return Boolean(byDiscord && (!byDiscord.user_id || byDiscord.user_id === user.id))
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const origin = url.origin
    const code = url.searchParams.get('code')
    const next = sanitizeNextPath(url.searchParams.get('next'))
    const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error')

    if (oauthError) {
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(oauthError)}`, origin))
    }

    if (!code) {
        return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent('인증 코드가 없습니다.')}`, origin),
        )
    }

    try {
        const supabase = await createRouteClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error || !data.user) {
            const message = error?.message ?? '세션 생성에 실패했습니다.'
            return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))
        }

        // ⚠ 길드 게이트는 계정 연결/아바타 동기화보다 먼저 수행한다 —
        //   비멤버의 members 행을 건드리지 않도록.
        if (GUILD_GATE_ID) {
            const gate = await checkGuildMembership(data.session?.provider_token)
            if (!gate.ok) {
                await supabase.auth.signOut()
                return NextResponse.redirect(
                    new URL(`/login?error=${encodeURIComponent(gate.message)}`, origin),
                )
            }
        }

        const discordId = getDiscordId(data.user)

        // 미등록 사용자도 로그인 자체는 성공해야 하므로 연결 실패는 로그만 남긴다.
        if (discordId) {
            await linkDiscordAccount('members', discordId, data.user)
            await linkDiscordAccount('admins', discordId, data.user)
            await syncDiscordAvatar(discordId, data.user)
        }

        // 2차 방어: 파싱 결과가 같은 오리진이 아니면 무조건 '/'로 보낸다.
        const target = new URL(next, origin)
        if (target.origin !== origin) {
            return NextResponse.redirect(new URL('/', origin))
        }

        // 최초 로그인(= 미등록)이면 온보딩으로 유도한다.
        // 단, next 가 특정 경로를 명시하면(예: /admin 을 거쳐 로그인) 그 의도를 존중한다.
        // 기본값('/') 이거나 온보딩 자체를 가리킬 때만 온보딩으로 보낸다.
        if ((next === '/' || next === '/onboarding') && !(await isRegisteredMember(data.user))) {
            return NextResponse.redirect(new URL('/onboarding', origin))
        }

        return NextResponse.redirect(target)
    } catch (e) {
        const message = e instanceof Error ? e.message : '로그인 처리 중 오류 발생'
        console.error('[auth/callback]', message)
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin))
    }
}
