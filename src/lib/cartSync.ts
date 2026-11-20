import { useQuery, type QueryClient } from '@tanstack/react-query';
import { getGetCartQueryKey } from '@/api/generated/cart-controller/cart-controller';
import type { RsDataCartResponse } from '@/api/generated/model';

// 결제 뒤 BE는 결제 이벤트를 받은 다음에 장바구니에서 주문 수량을 뺀다(아웃박스 릴레이, 보통 1~2초).
// 결제 직후 장바구니를 다시 받으면 빼기 전 값이 와서 헤더 배지가 남으므로,
// 결제한 화면이 "이 재고들이 바뀔 때까지 확인해 달라"는 표시를 남기고, 늘 떠 있는 헤더가 잠깐 다시 묻는다.
const CART_SYNC_KEY = ['cart-sync'] as const;
const SYNC_WINDOW_MS = 10_000;
export const CART_SYNC_INTERVAL_MS = 1_000;

// pending: 결제 순간 장바구니에 담겨 있던 주문 재고와 그 수량. 이 수량이 달라지면 BE가 처리한 것이다
export type CartSync = { until: number; pending: Record<number, number> };

export function requestCartSync(queryClient: QueryClient, orderedInventoryIds: number[]) {
    const items = queryClient.getQueryData<RsDataCartResponse>(getGetCartQueryKey())?.data?.items ?? [];
    const pending: Record<number, number> = {};
    for (const item of items) {
        if (item.inventoryId != null && orderedInventoryIds.includes(item.inventoryId)) {
            pending[item.inventoryId] = item.quantity ?? 0;
        }
    }
    // 장바구니에 없던 상품을 결제했으면(공동구매 주문 등) 장바구니는 바뀌지 않으므로 기다리지 않는다
    if (Object.keys(pending).length === 0) return;
    queryClient.setQueryData<CartSync>(CART_SYNC_KEY, { until: Date.now() + SYNC_WINDOW_MS, pending });
}

export function useCartSync(): CartSync | undefined {
    return (
        useQuery<CartSync | null>({ queryKey: CART_SYNC_KEY, queryFn: () => null, enabled: false, staleTime: Infinity })
            .data ?? undefined
    );
}

export function isCartSynced(sync: CartSync, cart: RsDataCartResponse | undefined): boolean {
    const items = cart?.data?.items ?? [];
    return Object.entries(sync.pending).every(
        ([inventoryId, quantity]) => items.find((item) => item.inventoryId === Number(inventoryId))?.quantity !== quantity,
    );
}

// 다 맞춰졌거나 시간이 지나면 표시를 지운다. 시간이 지나 끝났으면 장바구니를 '오래됨'으로 두어
// 다음 계기(창 포커스, 장바구니 화면 진입)에 다시 받게 한다
export function finishCartSync(queryClient: QueryClient, timedOut: boolean) {
    queryClient.removeQueries({ queryKey: CART_SYNC_KEY });
    if (timedOut) void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(), refetchType: 'none' });
}
