export function resolveRankBgUrl(path: string, storagePublicUrl: (path: string) => string): string {
  return path.startsWith('/') ? path : storagePublicUrl(path)
}
