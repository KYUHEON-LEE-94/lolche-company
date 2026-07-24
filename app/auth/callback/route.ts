import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordAvatarUrl, getDiscordId, sanitizeNextPath } from '@/lib/auth/discord'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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
