'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    getGetDetail1QueryKey,
    getGetMyList1QueryKey,
    useAddItem,
    useAdjustItemQuantity,
    useChangeItemOption,
    useChangeItemQuantity,
    useRemoveItem1,
} from '@/api/generated/shared-group-purchase-controller/shared-group-purchase-controller';

// 공동물품 품목 담기·수량 변경(절대값 changeQuantity · 증감 adjustQuantity)·옵션 변경·빼기. BE는 결과 본문을 주지 않으므로 성공·실패 모두 상세를 다시 받는다.
// 실패도 다시 받는 이유: 수정 마감(CART_SHARED_EDIT_CLOSED)·다른 참여자가 먼저 뺀 품목(CART_SHARED_ITEM_NOT_FOUND)처럼
// 화면이 낡아서 생기는 실패가 대부분이기 때문이다.
export function useSharedItemMutations(id: number) {
    const queryClient = useQueryClient();
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: getGetDetail1QueryKey(id) });
        // 목록 카드에는 금액·품목이 없지만 상태(마감 등)가 바뀌었을 수 있다.
        void queryClient.invalidateQueries({ queryKey: getGetMyList1QueryKey() });
    };
    const mutation = { onSettled: refresh };

    return {
        add: useAddItem({ mutation }),
        changeQuantity: useChangeItemQuantity({ mutation }),
        // +/- 버튼용. BE가 잠금 안에서 현재 수량에 더하므로 여러 참여자가 동시에 눌러도 모두 반영된다.
        adjustQuantity: useAdjustItemQuantity({ mutation }),
        // 같은 상품의 다른 재고로 바꾼다. 이미 담긴 재고로 바꾸면 BE가 두 품목을 합친다.
        changeOption: useChangeItemOption({ mutation }),
        remove: useRemoveItem1({ mutation }),
    };
}
