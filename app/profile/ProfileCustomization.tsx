'use client'

import { useCallback, useState } from 'react'
import type { PublicTitleBadge } from '@/lib/achievements/titles'
import ProfileEditor from './ProfileEditor'
import TitleBadgeManager from './TitleBadgeManager'

type MemberPreview = {
  id: string
  member_name: string
  riot_id: string
  discord_avatar_url: string | null
  profile_frame_path: string | null
  profile_updated_at: string | null
}

export default function ProfileCustomization({
  member,
}: {
  member: MemberPreview
}) {
  const [equippedTitles, setEquippedTitles] = useState<PublicTitleBadge[]>([])
  const handleEquippedChange = useCallback((titles: PublicTitleBadge[]) => {
    setEquippedTitles(titles)
  }, [])

  return (
    <div className="grid gap-6">
      <ProfileEditor member={member} equippedTitles={equippedTitles} />
      <TitleBadgeManager onEquippedChange={handleEquippedChange} />
    </div>
  )
}
