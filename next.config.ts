import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
