export const RANK_EFFECT_KEYS = ['aurora_glow', 'hex_grid', 'starfield'] as const
export type RankEffectKey = (typeof RANK_EFFECT_KEYS)[number]
const CLASS: Record<RankEffectKey,string> = {
  aurora_glow:'before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-r before:from-cyan-400/10 before:via-violet-400/10 before:to-emerald-400/10 motion-safe:before:animate-pulse',
  hex_grid:'before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(60deg,transparent_45%,rgba(99,102,241,.12)_46%,transparent_48%)] before:bg-[length:18px_18px]',
  starfield:'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,.22)_0_1px,transparent_2px),radial-gradient(circle_at_75%_65%,rgba(255,255,255,.18)_0_1px,transparent_2px)] before:bg-[length:32px_32px]',
}
export function rankEffectClass(key:string|null|undefined):string { return key && (RANK_EFFECT_KEYS as readonly string[]).includes(key) ? CLASS[key as RankEffectKey] : '' }
