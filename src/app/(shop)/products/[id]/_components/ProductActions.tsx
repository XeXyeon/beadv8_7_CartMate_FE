'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { addItem1, changeQuantity, getCart, getGetCartQueryKey, useAddItem1 } from '@/api/generated/cart-controller/cart-controller';
import type { RsDataCartResponse } from '@/api/generated/model';
import { ApiError, errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { useCurrentUser } from '@/lib/auth';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';

type Props = {
    postId: number;
    inventoryId: number | null; // 고른 상품 · 옵션 조합의 재고. 아직 다 고르지 않았으면 null
    available: number; // 그 재고의 구매 가능 수량
    quantity: number;
    onSale: boolean;
    // 고른 재고 · 수량의 합계. 모바일 하단 바에 보여 준다. 옵션을 다 고르지 않았거나 가격 문의면 null
    total: number | null;
};

// 상품 상세의 구매 버튼 영역.
// - 장바구니 담기: 고른 상품 · 옵션 조합의 재고(inventoryId)를 담는다. 옵션을 다 고르지 않았거나 품절이면 막는다
// - 바로 구매: BE에 바로 주문 API가 없어 장바구니를 거친다. 고른 재고를 담고 그 항목만 주문서(/checkout?items=)로 보낸다
export default function ProductActions({ postId, inventoryId, available, quantity, onSale, total }: Props) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isLoggedIn, isLoading: userLoading } = useCurrentUser();
    const addToCart = useAddItem1({
        mutation: {
            // 헤더의 장바구니 개수 등이 바로 갱신되도록 장바구니 조회를 다시 불러온다.
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
        },
    });

    const buyNow = useMutation({
        mutationFn: (item: { inventoryId: number; quantity: number }) => putInCartForCheckout(item.inventoryId, item.quantity),
        // 주문서는 캐시된 장바구니에서 항목을 찾으므로, 방금 받은 장바구니를 캐시에 넣고 넘어간다(다시 조회하다 실패해도 빈 주문서가 뜨지 않게)
        onSuccess: ({ cartItemId, cart }) => {
            queryClient.setQueryData(getGetCartQueryKey(), cart);
            router.push(`${ROUTES.checkout}?items=${cartItemId}`);
        },
        // 실패해도 장바구니가 바뀌었을 수 있다(담은 뒤 조회 실패 등)
        onError: () => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
    });

    const soldOut = inventoryId !== null && available <= 0;
    const canBuy = onSale && inventoryId !== null && !soldOut;
    // 결과 메시지는 지금 고른 재고 · 수량으로 담았을 때만 보여 준다. (다른 옵션을 고르면 이전 결과를 숨긴다)
    const sent = addToCart.variables?.data;
    const isCurrent = sent?.inventoryId === inventoryId && sent?.quantity === quantity;
    // 401은 전역 만료 처리가 로그인 화면으로 보내므로 따로 표시하지 않는다.
    const showError = addToCart.isError && isCurrent && !(addToCart.error instanceof ApiError && addToCart.error.status === 401);
    const buyNowSent = buyNow.variables;
    const showBuyNowError =
        buyNow.isError && buyNowSent?.inventoryId === inventoryId && buyNowSent?.quantity === quantity && !(buyNow.error instanceof ApiError && buyNow.error.status === 401);

    // 로그인 확인 전(서버 렌더 화면을 이어받는 중 포함)에는 로그인 화면으로 보내지 않는다. 비로그인이면 로그인 뒤 이 상품으로 돌아온다
    const requireLogin = () => {
        if (userLoading) return true;
        if (!isLoggedIn) {
            router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.product(postId))}`);
            return true;
        }
        return false;
    };

    const handleAddToCart = () => {
        if (inventoryId === null || requireLogin()) return;
        addToCart.mutate({ data: { inventoryId, quantity } });
    };

    // 다시 그려지기 전의 연속 클릭도 막는다. 두 번 담기면 BE가 수량을 합친다
    const buyNowLock = useRef(false);
    const handleBuyNow = () => {
        if (inventoryId === null || buyNow.isPending || buyNowLock.current || requireLogin()) return;
        buyNowLock.current = true;
        buyNow.mutate({ inventoryId, quantity }, { onSettled: () => { buyNowLock.current = false; } });
    };
    const busy = addToCart.isPending || buyNow.isPending;

    return (
        // 모바일(lg 미만)은 화면 하단에 붙는 바(sticky), 데스크톱은 합계 아래 일반 흐름. 버튼 · 메시지는 한 벌만 그린다.
        // fixed가 아니라 sticky라서 상품 정보 열이 끝나면 바도 함께 빠져 푸터를 가리지 않는다.
        <div className="sticky bottom-0 z-30 -mx-4 flex flex-col gap-2 bg-surface-container-lowest px-4 pb-4 pt-3 shadow-lg sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:p-0 lg:pt-1 lg:shadow-none">
            <div className="flex items-baseline justify-between lg:hidden">
                <Text type="supporting" color="secondary">합계</Text>
                <Text weight="bold" hasTabularNumbers>{total === null ? '-' : formatPrice(total)}</Text>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Button
                    label="장바구니 담기"
                    variant="secondary"
                    size="lg"
                    width="100%"
                    icon={<Icon name="shopping_cart" />}
                    isDisabled={!canBuy || buyNow.isPending}
                    isLoading={addToCart.isPending}
                    onClick={handleAddToCart}
                />
                <Button
                    label="바로 구매"
                    variant="primary"
                    size="lg"
                    width="100%"
                    icon={<Icon name="bolt" />}
                    isDisabled={!canBuy || addToCart.isPending}
                    isLoading={buyNow.isPending}
                    onClick={handleBuyNow}
                />
            </div>
            {onSale ? <Button label="공동구매 시작하기" href={ROUTES.groupPurchaseNew} as={Link} variant="secondary" size="lg" width="100%" icon={<Icon name="group_add" />} isDisabled={busy} /> : <Button label="공동구매 시작하기" variant="secondary" size="lg" width="100%" icon={<Icon name="group_add" />} isDisabled tooltip="판매 중인 상품만 공동구매를 시작할 수 있습니다" />}
            {addToCart.isSuccess && isCurrent && (
                <div className="flex items-center gap-2" role="status">
                    <Icon name="check_circle" className="text-[16px] text-primary" />
                    <Text type="supporting">장바구니에 담았습니다.</Text>
                    <Link className="underline underline-offset-2 hover:text-primary" href={ROUTES.cart}>
                        장바구니 보기
                    </Link>
                </div>
            )}
            {showError && (
                <p className="font-body-sm text-body-sm text-error" role="alert">
                    {errorMessage(addToCart.error, '장바구니에 담지 못했습니다.')}
                </p>
            )}
            {showBuyNowError && (
                <p className="font-body-sm text-body-sm text-error" role="alert">
                    {errorMessage(buyNow.error, '주문서로 넘어가지 못했습니다.')}
                </p>
            )}
            {!onSale && <Text type="supporting" color="secondary">현재 판매하지 않는 상품은 구매할 수 없습니다.</Text>}
            {onSale && soldOut && <Text type="supporting" className="text-error">품절된 옵션입니다. 다른 옵션을 골라 주세요.</Text>}
        </div>
    );
}

// 바로 구매용으로 고른 재고를 장바구니에 넣고, 그 항목 id와 마지막으로 받은 장바구니를 돌려준다.
// BE는 같은 재고를 다시 담으면 수량을 합치므로, 이미 담겨 있으면 수량을 지금 고른 수량으로 바꾼다(사용자 결정 2026-11-19).
// 담기 응답에 항목 id가 없어 장바구니를 다시 조회해 찾는다
async function putInCartForCheckout(inventoryId: number, quantity: number): Promise<{ cartItemId: number; cart: RsDataCartResponse }> {
    const findItem = (cart: RsDataCartResponse) => cart.data?.items?.find((item) => item.inventoryId === inventoryId);

    const before = await getCart();
    const existing = findItem(before);
    if (existing?.cartItemId != null) {
        // 주문서는 구매할 수 없는 항목을 빼므로, 그런 항목은 수량을 바꾸지 않고 멈춘다
        if (existing.purchasable === false) throw new Error('장바구니에 구매할 수 없는 상태로 담겨 있는 상품입니다. 장바구니를 확인해 주세요.');
        if (existing.quantity === quantity) return { cartItemId: existing.cartItemId, cart: before };
        await changeQuantity(existing.cartItemId, { quantity });
        return { cartItemId: existing.cartItemId, cart: await getCart() };
    }
    await addItem1({ inventoryId, quantity });
    const after = await getCart();
    const added = findItem(after);
    if (added?.cartItemId == null) throw new Error('장바구니에 담은 상품을 찾지 못했습니다. 장바구니에서 주문해 주세요.');
    return { cartItemId: added.cartItemId, cart: after };
}
