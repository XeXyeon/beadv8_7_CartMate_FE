import type { ReactNode } from 'react';
import RedirectIfLoggedIn from './_components/RedirectIfLoggedIn';

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-screen w-full items-center justify-center bg-background text-on-background px-gutter py-10 sm:py-16">
            <RedirectIfLoggedIn />
            {children}
        </main>
    );
}
