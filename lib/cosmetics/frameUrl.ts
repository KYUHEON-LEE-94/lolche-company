export function resolveFrameUrl(path: string, storagePublicUrl: (path: string) => string): string {
  return path.startsWith('/') ? path : storagePublicUrl(path)
}

/** 우리가 만든 생성 링 프레임(대칭)만 회전 대상. 펭구 등 캐릭터 프레임(스토리지 경로)은 제외. */
export function isSpinningFrame(imagePath: string | null | undefined): boolean {
  return typeof imagePath === 'string' && imagePath.startsWith('/frames/generated/')
}
