'use client';

import Link from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useSelectSalesPostAll, type selectSalesPostAll } from '@/api/generated/sales-post-controller/sales-post-controller';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import SalesPostCard, { SalesPostCardSkeleton } from './SalesPostCard';
import { toSalesPostCardWithTrust } from './SellerTrust';

export const HOME_PAGE_SIZE = 8;

// 홈 "최신 판매 상품" 목록(GET /api/sales-posts, 최신 등록순). 카테고리 · 가격 필터와 정렬은 검색 화면(/search)에서 한다.
// initialData: 서버(page.tsx)가 미리 받은 첫 페이지. 있으면 첫 HTML부터 상품 카드 · 링크가 들어간다. (OPS-9)
export default function HomeSalesPosts({ initialData }: { initialData?: Awaited<ReturnType<typeof selectSalesPostAll>> }) {
    const query = useSelectSalesPostAll({ page: 0, size: HOME_PAGE_SIZE }, { query: { initialData } });
    const page = query.data?.data;
    const cards = (page?.content ?? []).map(toSalesPostCardWithTrust).filter((item) => item !== null);

    return (
        <section className="flex flex-col gap-7" aria-labelledby="latest-products">
            <div className="flex items-end justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-2">
                    <Heading id="latest-products" level={2}>새로 등록된 상품</Heading>
                    {page && <Text type="supporting" color="secondary">전체 {page.totalElements ?? 0}개</Text>}
                </div>
                <Button label="전체 상품 보기" href={ROUTES.search} as={Link} variant="ghost" size="sm" endContent={<Icon name="arrow_forward" />} />
            </div>

            {query.isPending ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-gutter">
                    {Array.from({ length: HOME_PAGE_SIZE }, (_, i) => (
                        <SalesPostCardSkeleton key={i} />
                    ))}
                </div>
            ) : query.isError ? (
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center" role="alert">
                    <Text>{errorMessage(query.error, '상품 목록을 불러오지 못했습니다.')}</Text>
                    <div className="mt-4"><Button label="다시 시도" onClick={() => query.refetch()} /></div>
                </div>
            ) : cards.length === 0 ? (
                <EmptyState title="아직 등록된 판매 상품이 없습니다" description="새 상품이 등록되면 이곳에서 바로 확인할 수 있어요." />
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-gutter">
                    {cards.map(({ card, trust }) => (
                        <SalesPostCard key={card.id} post={card} trust={trust} />
                    ))}
                </div>
            )}
        </section>
    );
}
