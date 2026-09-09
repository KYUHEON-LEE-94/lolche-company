import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { supabaseService } from '@/lib/supabase/service'
import { isMissingTableError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_ENDPOINT = 1024
const MAX_KEY = 256

type ParsedSubscription = { endpoint: string; p256dh: string; auth: string }

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

/** body 화이트리스트 파싱. 어떤 member 식별자도 받지 않는다(소유권은 세션에서만 유도). */
function parseSubscription(body: unknown): ParsedSubscription | null {
  if (!body || typeof body !== 'object') return null
  const record = body as { endpoint?: unknown; keys?: unknown }
  const endpoint = text(record.endpoint, MAX_ENDPOINT)
  if (!endpoint || !endpoint.startsWith('https://')) return null
  const keys = record.keys
  if (!keys || typeof keys !== 'object') return null
  const p256dh = text((keys as { p256dh?: unknown }).p256dh, MAX_KEY)
  const auth = text((keys as { auth?: unknown }).auth, MAX_KEY)
  if (!p256dh || !auth) return null
  return { endpoint, p256dh, auth }
}

async function resolveMember() {
  const me = await getMyMember()
  if (!me.ok) return { ok: false as const, status: me.status, message: me.message }
  if (!me.member) {
    return { ok: false as const, status: 400, message: '먼저 프로필에서 멤버 등록을 완료해주세요.' }
  }
  return { ok: true as const, memberId: me.member.id }
}

export async function POST(req: Request) {
  const me = await resolveMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })

  const parsed = parseSubscription(await req.json().catch(() => null))
  if (!parsed) {
    return NextResponse.json({ ok: false, message: '구독 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null

  // endpoint 는 브라우저가 발급하므로 위조로 남의 기기를 가로챌 수 없다.
  // 같은 브라우저를 다른 사람이 로그인해 쓰는 경우를 위해 소유권 이전(upsert)을 허용한다.
  const { error } = await supabaseService
    .schema('public')
    .from('push_subscriptions')
    .upsert(
      {
        member_id: me.memberId,
        endpoint: parsed.endpoint,
        p256dh: parsed.p256dh,
        auth: parsed.auth,
        user_agent: userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { ok: false, message: '알림 기능 준비 중입니다(마이그레이션 필요).' },
        { status: 503 },
      )
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const me = await resolveMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null
  const endpoint = text(body?.endpoint, MAX_ENDPOINT)
  if (!endpoint) {
    return NextResponse.json({ ok: false, message: 'endpoint 가 필요합니다.' }, { status: 400 })
  }

  // ⚠ member_id 조건이 없으면 남의 endpoint 를 알아낸 사람이 구독을 지울 수 있다.
  const { error } = await supabaseService
    .schema('public')
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('member_id', me.memberId)

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { ok: false, message: '알림 기능 준비 중입니다(마이그레이션 필요).' },
        { status: 503 },
      )
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
