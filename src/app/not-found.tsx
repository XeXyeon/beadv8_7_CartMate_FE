import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
    title: `페이지를 찾을 수 없습니다 | ${SITE_NAME}`,
    robots: { index: false, follow: true },
};

// 어느 화면에도 맞지 않는 주소. 없으면 Next 기본 영문 404가 나온다. (OPS-3)
export default function NotFound() {
    return (
        <div className="min-h-screen bg-background text-on-background">
            <SiteHeader />
            <main className="w-full min-h-[calc(100vh-320px)]">
                <div className="max-w-[1200px] mx-auto px-4 py-16 sm:px-6">
                    <div className="flex flex-col items-center gap-space-md rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center">
                        <Icon name="search_off" />
                        <h1 className="font-headline-sm text-headline-sm text-on-surface">페이지를 찾을 수 없습니다</h1>
                        <p className="font-body-md text-body-md text-secondary">주소가 바뀌었거나 잘못 입력되었을 수 있어요.</p>
                        <div className="flex flex-wrap justify-center gap-space-sm">
                            <Link href={ROUTES.home} className="inline-flex h-10 items-center rounded bg-primary px-space-md font-label-md text-label-md text-on-primary">
                                홈으로
                            </Link>
                            <Link href={ROUTES.search} className="inline-flex h-10 items-center rounded border border-outline-variant px-space-md font-label-md text-label-md text-on-surface">
                                전체 상품 보기
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </div>
    );
}
