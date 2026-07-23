import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // 홈 디렉토리(C:\Users\user)에 무관한 package-lock.json 이 있어서
    // Turbopack 이 워크스페이스 루트를 그쪽으로 잘못 추론한다.
    // 루트를 이 파일이 있는 디렉토리로 고정한다.
    turbopack: {
        root: __dirname,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
            {
                protocol: 'https',
                hostname: 'raw.communitydragon.org',
            },
            // 디스코드 아바타 (members.discord_avatar_url)
            {
                protocol: 'https',
                hostname: 'cdn.discordapp.com',
                pathname: '/avatars/**',
            },
            // 스팀 아바타
            {
                protocol: 'https',
                hostname: 'avatars.steamstatic.com',
            },
            // 스팀 게임 카드 이미지
            {
                protocol: 'https',
                hostname: 'cdn.cloudflare.steamstatic.com',
            },
        ],
    },
}

export default nextConfig;
