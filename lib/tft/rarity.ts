/** rarity(0-4) → 비용 등급 Tailwind border 클래스 */
export function rarityBorderClass(rarity: number): string {
  const map: Record<number, string> = {
    0: 'border-slate-400',
    1: 'border-green-400',
    2: 'border-blue-400',
    3: 'border-purple-400',
    4: 'border-yellow-400',
  }
  return map[rarity] ?? 'border-slate-400'
}
