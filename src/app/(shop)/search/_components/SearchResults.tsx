'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Text } from '@astryxdesign/core/Text';
import { useSearchSalesPosts } from '@/api/generated/sales-post-search-controller/sales-post-search-controller';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { hasFilters, readSearchState, searchHref, toApiParams, type SearchState } from '../_lib/searchParams';
import SalesPostCard, { SalesPostCardSkeleton } from '../../_components/SalesPostCard';
import { toSalesPostCardWithTrust } from '../../_components/SellerTrust';
import { SearchFilters, SearchSortBar, type ChangeSearch } from './SearchFilters';

const PAGE_SIZE = 12;
// 페이지 번호는 현재 페이지 앞뒤로 이만큼만 보여 준다.
const PAGE_WINDOW = 2;

const SEARCH_TIPS = [
    '단어의 철자가 정확한지 확인해 보세요.',
    "보다 일반적인 검색어로 다시 검색해 보세요 (예: '글러브', '보호대').",
    '팀 대량 구매 문의는 고객센터 1:1 견적 요청을 이용하실 수 있습니다.',
];

// 검색어(q) · 카테고리 · 가격대 · 정렬로 판매글을 검색한다(GET /api/sales-posts/search). 종목 필터와 공동구매 인기순은 BE가 지원하지 않아 비활성이다.
export default function SearchResults() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const state = readSearchState(searchParams);
    const { keyword } = state;

    const query = useSearchSalesPosts(toApiParams(state, PAGE_SIZE));
    // 조건을 바꾸면 첫 페이지부터 다시 본다
    const changeSearch: ChangeSearch = (patch) => router.push(searchHref({ ...state, ...patch, page: 1 }), { scroll: false });
    const result = query.data?.data;
    const cards = (result?.content ?? []).map(toSalesPostCardWithTrust).filter((item) => item !== null);
    const totalPages = result?.totalPages ?? 0;

    return (
        <div className="flex w-full flex-col gap-7">
            <div className="flex flex-wrap items-baseline gap-2">
                <Heading level={1}>
                    {keyword ? <>&quot;{keyword}&quot; 검색 결과</> : '전체 상품'}
                </Heading>
                {result && <Text type="supporting" color="secondary">총 {result.totalElements ?? 0}개 상품</Text>}
            </div>

            <div className="flex flex-col lg:flex-row gap-gutter w-full items-start">
                <SearchFilters state={state} onChange={changeSearch} />
                <div className="flex-1 w-full flex flex-col gap-space-lg">
                    <SearchSortBar state={state} onChange={changeSearch} />
                    {query.isPending ? (
                        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-gutter w-full">
                            {Array.from({ length: PAGE_SIZE }, (_, i) => (
                                <SalesPostCardSkeleton key={i} />
                            ))}
                        </div>
                    ) : query.isError ? (
                        <div className="w-full rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center" role="alert">
                            <Text>{errorMessage(query.error, '검색 결과를 불러오지 못했습니다.')}</Text>
                            <div className="mt-4"><Button label="다시 시도" onClick={() => query.refetch()} /></div>
                        </div>
                    ) : cards.length === 0 && (result?.totalElements ?? 0) > 0 ? (
                        // 상품은 있는데 마지막 페이지를 넘어선 경우 (예: ?page=999)
                        <div className="w-full rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center">
                            <EmptyState title="이 페이지에는 상품이 없습니다" description="첫 페이지에서 검색 결과를 다시 확인해 주세요." actions={<Button label="첫 페이지로" href={searchHref({ ...state, page: 1 })} as={Link} variant="primary" />} />
                        </div>
                    ) : cards.length === 0 ? (
                        <EmptyResult state={state} onResetFilters={() => changeSearch({ categoryIds: [], price: null })} />
                    ) : (
                        <>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-gutter w-full">
                                {cards.map(({ card, trust }) => (
                                    <SalesPostCard key={card.id} post={card} trust={trust} />
                                ))}
                            </div>
                            {totalPages > 1 && <SearchPagination state={state} totalPages={totalPages} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// 페이지 번호는 astryx Pagination. 번호를 누르면 URL의 page 를 바꿔 이동한다(뒤로 가기 · 공유 주소 유지).
function SearchPagination({ state, totalPages }: { state: SearchState; totalPages: number }) {
    const router = useRouter();
    return (
        <div className="flex justify-center py-space-md">
            <Pagination label="페이지" page={state.page} totalPages={totalPages} siblingCount={PAGE_WINDOW} onChange={(next) => router.push(searchHref({ ...state, page: next }))} />
        </div>
    );
}

function EmptyResult({ state, onResetFilters }: { state: SearchState; onResetFilters: () => void }) {
    const { keyword } = state;
    // 필터 때문에 비었으면 필터를 풀어 보도록 먼저 안내한다
    if (hasFilters(state)) {
        return (
            <div className="w-full rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center">
                <EmptyState
                    title="조건에 맞는 상품이 없습니다"
                    description="카테고리나 가격대 조건을 줄여 다시 찾아보세요."
                    icon={<Icon name="filter_alt_off" className="text-[32px]" />}
                    actions={<Button label="필터 초기화" onClick={onResetFilters} variant="primary" />}
                />
            </div>
        );
    }
    return (
        <div className="w-full rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center">
            <EmptyState
                title={keyword ? `“${keyword}”에 대한 검색 결과가 없습니다` : '아직 등록된 판매 상품이 없습니다'}
                description={keyword ? '철자를 확인하거나 더 짧고 일반적인 검색어를 입력해 보세요.' : '새 상품이 등록되면 이곳에서 확인할 수 있어요.'}
                icon={<Icon name="search_off" className="text-[32px]" />}
                actions={keyword ? <Button label="전체 상품 보기" href={ROUTES.search} as={Link} variant="primary" /> : undefined}
            />
            {keyword && (
                    <div className="mx-auto mt-6 flex w-full max-w-[440px] flex-col gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-left font-body-sm text-body-sm text-outline">
                        <div className="font-label-sm text-label-sm text-on-surface flex items-center gap-1 mb-1">
                            <Icon name="lightbulb" className="text-[16px]" />
                            검색 팁
                        </div>
                        {SEARCH_TIPS.map((tip) => (
                            <div key={tip} className="flex items-start gap-1">
                                <span>·</span>
                                <span>{tip}</span>
                            </div>
                        ))}
                    </div>
            )}
        </div>
    );
}
