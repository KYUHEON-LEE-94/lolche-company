export const RANK_EFFECT_KEYS = ['aurora_glow', 'hex_grid', 'starfield', 'sunset_blaze', 'verdant_pulse'] as const
export type RankEffectKey = (typeof RANK_EFFECT_KEYS)[number]
const CLASS: Record<RankEffectKey,string> = {
  aurora_glow: 'rank-card-effect rank-card-effect--aurora',
  hex_grid: 'rank-card-effect rank-card-effect--hex-grid',
  starfield: 'rank-card-effect rank-card-effect--starfield',
  sunset_blaze: 'rank-card-effect rank-card-effect--sunset',
  verdant_pulse: 'rank-card-effect rank-card-effect--verdant',
}
export function rankEffectClass(key:string|null|undefined):string { return key && (RANK_EFFECT_KEYS as readonly string[]).includes(key) ? CLASS[key as RankEffectKey] : '' }
