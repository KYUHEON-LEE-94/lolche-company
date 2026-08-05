import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/app/components/SiteNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "롤토 컴퍼니",
  description: "롤토 컴퍼니 단톡방 멤버들 순위 사이트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://ddragon.leagueoflegends.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://ddragon.leagueoflegends.com" />
        {/* FOUC 방지: paint 이전에 localStorage → 없으면 matchMedia 로 data-theme 를 심는다.
            next/script 는 실행 시점 보장이 약해 flash 가 생기므로 raw 인라인 스크립트를 쓴다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var t=localStorage.getItem('theme');` +
              `var d=t||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');` +
              `document.documentElement.setAttribute('data-theme',d);}catch(e){` +
              `document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          suppressHydrationWarning
      >
      <SiteNav />
      {children}
      </body>
      </html>
  );
}
