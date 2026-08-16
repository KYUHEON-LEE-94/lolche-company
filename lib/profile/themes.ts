export const PROFILE_THEME_KEYS = ['neon_arcade', 'deep_ocean', 'blossom_garden', 'starlit_library'] as const

export type ProfileThemeKey = (typeof PROFILE_THEME_KEYS)[number]

export function profileThemeClass(key: string | null | undefined) {
  return PROFILE_THEME_KEYS.includes(key as ProfileThemeKey) ? `profile-card-theme profile-card-theme--${key}` : ''
}
