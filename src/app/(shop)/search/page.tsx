import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ROUTES } from '@/lib/routes';
import { SITE_NAME, pageMetadata } from '@/lib/seo';
import SearchResults from './_components/SearchResults';

// 검색어 · 페이지가 붙은 URL(/search?…)은 robots.txt에서 막고, 쿼리 없는 /search만 색인한다.
export const metadata: Metadata = pageMetadata({
    title: `상품 검색 - 팀 단체복 · 스포츠 장비 | ${SITE_NAME}`,
    description: `${SITE_NAME}에서 판매 중인 팀 유니폼 · 단체복과 스포츠 장비를 검색하고, 판매자 신뢰도와 가격을 비교해 보세요.`,
    path: ROUTES.search,
});

export default function SearchPage() {
    return (
        <div className="w-full">
            <div className="max-w-[1200px] mx-auto px-4 py-10 sm:px-6 sm:py-12">
                {/* 검색어(쿼리스트링)를 읽는 부분만 클라이언트에서 렌더링되도록 Suspense로 감싼다 */}
                <Suspense>
                    <SearchResults />
                </Suspense>
            </div>
        </div>
    );
}
