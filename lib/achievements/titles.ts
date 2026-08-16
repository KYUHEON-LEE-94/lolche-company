export const MAX_EQUIPPED_TITLES = 3

export type TitleKind = 'permanent' | 'conditional'

export type TitleView = {
  id: string
  key: string
  label: string
  description: string
  kind: TitleKind
  available: boolean
  equipped_slot: number | null
}
