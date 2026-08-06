import { redirect } from 'next/navigation'
import { requireAdmin } from '@/app/lib/isAdmin'
import PointsManager from './PointsManager'

export default async function AdminPointsPage() {
  if (!(await requireAdmin()).ok) redirect('/')
  return <PointsManager />
}
