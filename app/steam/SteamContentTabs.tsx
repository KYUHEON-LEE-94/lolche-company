'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type TabId = 'community' | 'deals'

const TABS: { id: TabId; label: string }[] = [
  { id: 'community', label: '커뮤니티 게임' },
  { id: 'deals', label: 'Steam 할인' },
]

type SteamContentTabsProps = {
  community: ReactNode
  deals: ReactNode
}

export default function SteamContentTabs({ community, deals }: SteamContentTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('community')
  const idPrefix = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectTab = (index: number) => {
    const tab = TABS[index]
    if (!tab) return
    setActiveTab(tab.id)
    tabRefs.current[index]?.focus()
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectTab((index + 1) % TABS.length)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectTab((index - 1 + TABS.length) % TABS.length)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      selectTab(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      selectTab(TABS.length - 1)
    }
  }

  return (
    <section>
      <div
        role="tablist"
        aria-label="스팀 콘텐츠"
        className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1"
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id
          const tabId = `${idPrefix}-${tab.id}-tab`
          const panelId = `${idPrefix}-${tab.id}-panel`

          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                isActive
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        const tabId = `${idPrefix}-${tab.id}-tab`
        const panelId = `${idPrefix}-${tab.id}-panel`

        return (
          <div
            key={tab.id}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId}
            hidden={!isActive}
          >
            {tab.id === 'community' ? community : deals}
          </div>
        )
      })}
    </section>
  )
}
