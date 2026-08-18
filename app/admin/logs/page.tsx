import { redirect } from 'next/navigation'
import { requireAdmin } from '@/app/lib/isAdmin'
import LogsClient from './LogsClient'

export default async function AdminLogsPage() {
  if (!(await requireAdmin()).ok) redirect('/')
  return <LogsClient />
}
