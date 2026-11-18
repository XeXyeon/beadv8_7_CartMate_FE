import type { SelectSalesPostProduct, SelectSalesPostResponse } from '@/api/generated/model';
import { SelectSalesPostProductStatus } from '@/api/generated/model';
import { toSalesPostCardWithTrust } from '../../_components/SellerTrust';
import { PRICE_RANGES, type SearchState } from './searchParams';

// 검색 결과 카드는 BE 검색과 같은 기준으로 가격을 보여 준다.
//   - 판매 중인 상품만 본다(색인도 판매 중 상품만 담는다)
//   - 카테고리 · 가격 필터가 있으면 같은 상품 하나가 조건을 모두 만족해야 걸리고, 가격순 정렬도 그 상품들의 최저가 기준이다
//     그래서 카드 가격 · 대표 상품명도 조건에 맞는 상품에서 고른다
// 예) 유니폼 25,000원 + 축구화 120,000원 판매글을 "10만원 이상"으로 찾으면 카드에 120,000원~ 이 보인다

function matchesFilter(product: SelectSalesPostProduct, state: SearchState): boolean {
    if (state.categoryIds.length > 0 && !state.categoryIds.includes(product.categoryId ?? -1)) return false;
    const range = PRICE_RANGES.find((item) => item.value === state.price);
    if (!range) return true;
    const price = product.basePrice;
    if (typeof price !== 'number') return false;
    if ('minPrice' in range && price < range.minPrice) return false;
    if ('maxPrice' in range && price > range.maxPrice) return false;
    return true;
}

export function toSearchCard(post: SelectSalesPostResponse, state: SearchState) {
    const products = post.productList ?? [];
    const onSale = products.filter((product) => product.status === SelectSalesPostProductStatus.ON_SALE);
    // 색인 반영이 늦어 판매 중 상품이 하나도 안 남은 글은 원래 목록 그대로 보여 준다
    const visible = onSale.length > 0 ? onSale : products;
    const item = toSalesPostCardWithTrust({ ...post, productList: visible });
    if (!item) return null;

    const matched = visible.filter((product) => matchesFilter(product, state));
    if (matched.length === 0 || matched.length === visible.length) return item;

    const prices = matched.map((product) => product.basePrice).filter((price): price is number => typeof price === 'number');
    return {
        ...item,
        card: {
            ...item.card,
            productName: matched[0].name ?? item.card.productName,
            minPrice: prices.length > 0 ? Math.min(...prices) : item.card.minPrice,
        },
    };
}
