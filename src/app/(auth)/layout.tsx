import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import RedirectIfLoggedIn from './_components/RedirectIfLoggedIn';

// 로그인 · 회원가입은 검색 결과에 내지 않는다 (OPS-4)
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-screen w-full items-center justify-center bg-surface px-gutter py-10 sm:py-16">
            <RedirectIfLoggedIn />
            {children}
        </main>
    );
}
