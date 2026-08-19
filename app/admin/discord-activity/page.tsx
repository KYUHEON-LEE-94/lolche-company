import { redirect } from 'next/navigation'
import { requireAdmin } from '@/app/lib/isAdmin'
import { getKstTodayDate } from '@/lib/discord/activityHelpers'
import DiscordActivityAdminClient from './DiscordActivityAdminClient'

export default async function AdminDiscordActivityPage() {
  if (!(await requireAdmin()).ok) redirect('/')
  // 기준일은 서버(KST)에서 계산해 넘긴다 — 브라우저 로컬 타임존에 의존하지 않도록.
  return <DiscordActivityAdminClient today={getKstTodayDate()} />
}
