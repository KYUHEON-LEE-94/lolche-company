// app/api/members/[id]/sync/route.ts
import { NextResponse } from 'next/server'
import { syncOneMember } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await params
  const result = await syncOneMember(memberId, doSyncMember)
  return NextResponse.json({ memberId, ...result }, { status: result.ok ? 200 : 500 })
}
