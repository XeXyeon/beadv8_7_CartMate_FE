import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, rootOpenGraph, siteUrl } from '@/lib/seo';
import Providers from './providers';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

const SITE_URL = siteUrl();

// 공개 화면 SEO 기본값 (OPS-4). 사이트 주소(SITE_URL)가 있을 때만 metadataBase를 둔다.
export const metadata: Metadata = {
    ...(SITE_URL && { metadataBase: SITE_URL }),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: rootOpenGraph,
    twitter: { card: 'summary_large_image' },
};

export default function RootLayout({
                                       children,
                                   }: {
    children: ReactNode;
}) {
    return (
        <html lang="ko" className={inter.variable}>
        <head>
            {/* App Router 루트 레이아웃이라 모든 페이지에 적용됨 (pages/_document 전용 규칙) */}
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link
                rel="stylesheet"
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
            />
        </head>
        {/* 브라우저 확장(ColorZilla 등)이 body 에 속성을 주입해 생기는 hydration 경고 방지 */}
        <body className="font-body-md text-body-md text-on-surface antialiased" suppressHydrationWarning>
            <Providers>{children}</Providers>
        </body>
        </html>
    );
}
