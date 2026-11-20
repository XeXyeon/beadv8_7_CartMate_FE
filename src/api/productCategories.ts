import { useQuery } from '@tanstack/react-query';
import { http, type RsData } from '@/api/http';

// 상품 카테고리 목록(GET /api/products/categories). 판매글 등록 · 수정 화면과 검색 필터가 함께 쓴다.
// 생성 타입(orval)이 아직 이 API를 모르므로 BE 응답 모양을 그대로 옮겨 적는다.

// 카테고리 하나. 등록 요청의 categoryId · 검색의 categoryIds로 그대로 쓴다
// BE: CategoryResponse(categoryId, name)
export type ProductCategoryItem = {
    categoryId: number;
    name: string;
};

const PRODUCT_CATEGORIES_KEY = ['product-categories'] as const;

// 카테고리는 서버 시작 때 들어가는 고정 데이터라 자주 바뀌지 않는다
export const MASTER_STALE_TIME = 10 * 60 * 1000;

function fetchProductCategories(): Promise<ProductCategoryItem[]> {
    return http<RsData<ProductCategoryItem[]>>('/api/products/categories').then((res) => res.data ?? []);
}

export function useProductCategories() {
    const query = useQuery({
        queryKey: PRODUCT_CATEGORIES_KEY,
        queryFn: fetchProductCategories,
        staleTime: MASTER_STALE_TIME,
    });
    return { categories: query.data ?? [], isLoading: query.isPending, error: query.error };
}
