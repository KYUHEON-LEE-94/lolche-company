import 'server-only'

import { getKstDateRange, parseDiscordActivitySummary, type ParsedDiscordActivitySummary } from './activityHelpers'

const DEFAULT_API_BASE_URL = 'https://tactician-discord-bot.up.railway.app'
const REQUEST_TIMEOUT_MS = 5_000
const CACHE_SECONDS = 300

export type DiscordGuildActivityResult =
  | ({ status: 'ready' } & ParsedDiscordActivitySummary)
  | { status: 'unconfigured' | 'unavailable'; period: { from: string; to: string } }

export async function fetchDiscordGuildActivity(now: Date = new Date()): Promise<DiscordGuildActivityResult> {
  const period = getKstDateRange(now)
  const apiKey = process.env.DISCORD_ACTIVITY_API_KEY?.trim()
  const guildId = process.env.DISCORD_ACTIVITY_GUILD_ID?.trim()
  const baseUrl = process.env.DISCORD_ACTIVITY_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL

  if (!apiKey || !guildId) return { status: 'unconfigured', period }

  let url: URL
  try {
    url = new URL(`/api/v1/guilds/${encodeURIComponent(guildId)}/members/summary`, baseUrl)
  } catch {
    console.warn('Discord activity API is unavailable: invalid base URL')
    return { status: 'unavailable', period }
  }
  url.searchParams.set('from', period.from)
  url.searchParams.set('to', period.to)
  url.searchParams.set('min_voice_seconds', '0')

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
    })
    if (!response.ok) {
      console.warn(`Discord activity API is unavailable: HTTP ${response.status}`)
      return { status: 'unavailable', period }
    }

    const body: unknown = await response.json()
    const parsed = parseDiscordActivitySummary(body)
    if (!parsed || parsed.guildId !== guildId) {
      console.warn('Discord activity API is unavailable: invalid response schema')
      return { status: 'unavailable', period }
    }
    return { status: 'ready', ...parsed }
  } catch {
    console.warn('Discord activity API is unavailable: request failed')
    return { status: 'unavailable', period }
  }
}
