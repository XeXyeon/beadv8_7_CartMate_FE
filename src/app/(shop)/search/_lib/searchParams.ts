import type { SearchSalesPostsParams } from '@/api/generated/model';
import { SearchSalesPostsSort } from '@/api/generated/model';
import { ROUTES } from '@/lib/routes';

// 검색 화면의 상태는 모두 URL 쿼리에 둔다(뒤로 가기 · 공유 주소 유지).
//   q        검색어
//   category 카테고리 id. 여러 개면 키를 반복한다(?category=1&category=3)
//   price    가격대 프리셋 키(PRICE_RANGES의 value)
//   sort     정렬(SORT_OPTIONS의 value). 없으면 BE 기본값: 검색어가 있으면 관련도순, 없으면 최신순
//   page     사람이 보는 1부터. BE 요청은 0부터

export type SortValue = 'relevance' | 'latest' | 'price-asc' | 'price-desc';

const SORT_TO_API: Record<SortValue, SearchSalesPostsSort> = {
    relevance: SearchSalesPostsSort.RELEVANCE,
    latest: SearchSalesPostsSort.LATEST,
    'price-asc': SearchSalesPostsSort.PRICE_ASC,
    'price-desc': SearchSalesPostsSort.PRICE_DESC,
};

// 가격은 판매글 안 판매 중 상품 가격 기준이다(BE: 같은 상품이 카테고리 · 가격 조건을 함께 만족해야 걸린다)
export const PRICE_RANGES = [
    { value: 'under-30k', label: '3만원 이하', maxPrice: 30_000 },
    { value: '30k-50k', label: '3만원 ~ 5만원', minPrice: 30_000, maxPrice: 50_000 },
    { value: '50k-100k', label: '5만원 ~ 10만원', minPrice: 50_000, maxPrice: 100_000 },
    { value: 'over-100k', label: '10만원 이상', minPrice: 100_000 },
] as const satisfies readonly { value: string; label: string; minPrice?: number; maxPrice?: number }[];

export type PriceValue = (typeof PRICE_RANGES)[number]['value'];

export type SearchState = {
    keyword: string;
    categoryIds: number[];
    price: PriceValue | null;
    sort: SortValue | null;
    page: number;
};

type ReadableParams = { get(name: string): string | null; getAll(name: string): string[] };

function readPage(raw: string | null): number {
    const page = Number(raw);
    return Number.isInteger(page) && page >= 1 ? page : 1;
}

function readCategoryIds(raw: string[]): number[] {
    const ids = raw.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    return [...new Set(ids)].sort((a, b) => a - b);
}

function readSort(raw: string | null, keyword: string): SortValue | null {
    if (!raw || !(raw in SORT_TO_API)) return null;
    // 검색어 없이는 관련도를 매길 수 없다(BE도 최신순으로 바꾼다)
    if (raw === 'relevance' && !keyword) return null;
    return raw as SortValue;
}

function readPrice(raw: string | null): PriceValue | null {
    return PRICE_RANGES.find((range) => range.value === raw)?.value ?? null;
}

export function readSearchState(params: ReadableParams): SearchState {
    const keyword = params.get('q')?.trim() ?? '';
    return {
        keyword,
        categoryIds: readCategoryIds(params.getAll('category')),
        price: readPrice(params.get('price')),
        sort: readSort(params.get('sort'), keyword),
        page: readPage(params.get('page')),
    };
}

// 고른 정렬이 없을 때 화면에 보여 줄 정렬(BE 기본값과 같다)
export function effectiveSort(state: SearchState): SortValue {
    return state.sort ?? (state.keyword ? 'relevance' : 'latest');
}

export function hasFilters(state: SearchState): boolean {
    return state.categoryIds.length > 0 || state.price !== null;
}

export function searchHref(state: SearchState): string {
    const params = new URLSearchParams();
    if (state.keyword) params.set('q', state.keyword);
    for (const id of state.categoryIds) params.append('category', String(id));
    if (state.price) params.set('price', state.price);
    if (state.sort) params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    const query = params.toString();
    return query ? `${ROUTES.search}?${query}` : ROUTES.search;
}

export function toApiParams(state: SearchState, size: number): SearchSalesPostsParams {
    const range = PRICE_RANGES.find((item) => item.value === state.price);
    return {
        q: state.keyword || undefined,
        categoryIds: state.categoryIds.length > 0 ? state.categoryIds : undefined,
        minPrice: range && 'minPrice' in range ? range.minPrice : undefined,
        maxPrice: range && 'maxPrice' in range ? range.maxPrice : undefined,
        sort: state.sort ? SORT_TO_API[state.sort] : undefined,
        page: state.page - 1,
        size,
    };
}
