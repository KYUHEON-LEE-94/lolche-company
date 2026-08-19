export type DiscordActivityStatus = 'ready' | 'unconfigured' | 'unavailable'

export type DiscordActivityMember = {
  memberId: string
  memberName: string
  avatarUrl: string | null
  hasActivityData: boolean
  attendanceDays: number | null
  voiceSeconds: number | null
  voiceJoins: number | null
  messages: number | null
}

export type DiscordActivityOverview = {
  status: DiscordActivityStatus
  from: string
  to: string
  generatedAt: string | null
  members: DiscordActivityMember[]
}
