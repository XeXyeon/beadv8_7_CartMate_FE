'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetCart } from '@/api/generated/cart-controller/cart-controller';
import { useGetMyWallet } from '@/api/generated/wallet-controller/wallet-controller';
import { useCurrentUser } from '@/lib/auth';
import { CART_SYNC_INTERVAL_MS, finishCartSync, isCartSynced, useCartSync } from '@/lib/cartSync';
import { formatPrice } from '@/lib/salesPost';

// 헤더에 들어가는 로그인 사용자 값들. 로그인하지 않았으면 요청하지 않고 아무것도 표시하지 않는다.

export function DepositAmount() {
    const { isLoggedIn } = useCurrentUser();
    const wallet = useGetMyWallet({ query: { enabled: isLoggedIn } });
    const balance = wallet.data?.data?.balance;
    if (!isLoggedIn || balance === undefined) return null;

    return <span className="font-label-sm text-label-sm text-primary">{formatPrice(balance)}</span>;
}

export function CartCountBadge() {
    const queryClient = useQueryClient();
    const { isLoggedIn } = useCurrentUser();
    const sync = useCartSync();
    const cart = useGetCart({
        query: { enabled: isLoggedIn, refetchInterval: sync ? CART_SYNC_INTERVAL_MS : false },
    });

    // 결제 뒤 확인 중이면 매 조회마다 BE가 처리했는지 본다. 처리됐거나 10초가 지나면 묻기를 멈춘다
    useEffect(() => {
        if (!sync) return;
        if (isCartSynced(sync, cart.data)) finishCartSync(queryClient, false);
        else if (Date.now() >= sync.until) finishCartSync(queryClient, true);
    }, [queryClient, sync, cart.data, cart.dataUpdatedAt, cart.errorUpdatedAt]);

    const count = cart.data?.data?.items?.length ?? 0;
    if (!isLoggedIn || count === 0) return null;

    return (
        <span
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary font-caption text-caption flex items-center justify-center ring-2 ring-surface-container-lowest"
            aria-label={`장바구니 ${count}개`}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
}
