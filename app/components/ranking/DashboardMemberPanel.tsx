'use client'

import { AnimatePresence } from 'framer-motion'
import MemberDetailPanel from './MemberDetailPanel'

type PanelMember = {
  id: string
  member_name: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
}

/**
 * 홈 대시보드용 패널 래퍼.
 * framer-motion(AnimatePresence)과 차트가 홈 초기 번들에 들어가지 않도록
 * 호출부에서 next/dynamic 으로 지연 로드하는 경계다.
 * member=null 인 동안에도 마운트를 유지해야 닫기 애니메이션이 재생된다.
 */
export default function DashboardMemberPanel({
  member,
  onClose,
}: {
  member: PanelMember | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {member && <MemberDetailPanel member={member} queue="solo" onClose={onClose} />}
    </AnimatePresence>
  )
}
