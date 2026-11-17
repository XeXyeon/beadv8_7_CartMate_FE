// 판매글 상품 찜 API (상품 서비스 /api/sales-posts/products/{productId}/wish, /api/sales-posts/wishes).
// 생성 타입(orval)에 아직 없어 BE 응답(SalesPostProductWishResponse · PageResponse)대로 적는다.
// 찜 대상은 판매글이 아니라 판매글 상품 하나이고, 찜한 사람은 회원 번호로 저장된다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSelectSalesPostDetailQueryKey } from './generated/sales-post-controller/sales-post-controller';
import { http, type RsData } from './http';

// 내 찜 목록에 보여 줄 상태. UNAVAILABLE(운영 중지)은 상품명 · 이미지 · 가격이 비어 오고 찜 해제만 할 수 있다
export type WishDisplayStatus = 'ON_SALE' | 'PAUSED' | 'CLOSED' | 'UNAVAILABLE';

export type Wish = {
    salesPostId: number;
    productId: number;
    productName: string | null;
    thumbnailS3Key: string | null;
    basePrice: number | null;
    displayStatus: WishDisplayStatus;
    wishedAt: string;
};

export type WishPage = {
    content: Wish[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
};

const MY_WISHES_KEY = ['my-wishes'];

// 내 찜 목록. 최근 찜 먼저, 한 페이지에 20개
export function useMyWishes(page: number) {
    return useQuery({
        queryKey: [...MY_WISHES_KEY, page],
        queryFn: () => http<RsData<WishPage>>(`/api/sales-posts/wishes?page=${page}`).then((res) => res.data),
    });
}

type WishInput = { productId: number; wished: boolean; salesPostId: number };

// 찜하기(wished=true) · 찜 해제(wished=false). 둘 다 같은 요청을 다시 보내도 성공한다.
// 끝나면 그 판매글 상세(상품마다 wished)와 내 찜 목록을 다시 불러온다
export function useToggleWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ productId, wished }: WishInput) =>
            http<RsData<null>>(`/api/sales-posts/products/${productId}/wish`, { method: wished ? 'PUT' : 'DELETE' }),
        onSettled: (_data, _error, { salesPostId }) =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: getSelectSalesPostDetailQueryKey(salesPostId) }),
                queryClient.invalidateQueries({ queryKey: MY_WISHES_KEY }),
            ]),
    });
}
