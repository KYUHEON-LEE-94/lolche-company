import 'server-only'
import { requireAdmin } from '@/app/lib/isAdmin'
import { getMyMember, type MyMember } from '@/lib/members/myMember'

export type CalendarViewer = { userId: string; isAdmin: boolean; member: MyMember | null }

export async function getCalendarViewer(): Promise<{ ok: true; viewer: CalendarViewer } | { ok: false; status: number; message: string }> {
  const mine = await getMyMember()
  if (!mine.ok) return mine
  const admin = await requireAdmin()
  return { ok: true, viewer: { userId: mine.userId, isAdmin: admin.ok, member: mine.member } }
}
