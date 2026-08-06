export function resolveFrameUrl(path: string, storagePublicUrl: (path: string) => string): string {
  return path.startsWith('/') ? path : storagePublicUrl(path)
}
