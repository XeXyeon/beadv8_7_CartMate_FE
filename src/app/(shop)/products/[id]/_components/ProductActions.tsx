'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { getGetCartQueryKey, useAddItem1 } from '@/api/generated/cart-controller/cart-controller';
import { ApiError, errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { useCurrentUser } from '@/lib/auth';
import { ROUTES } from '@/lib/routes';

type Props = {
    postId: number;
    inventoryId: number | null; // 고른 상품 · 옵션 조합의 재고. 아직 다 고르지 않았으면 null
    available: number; // 그 재고의 구매 가능 수량
    needsOption: boolean; // 옵션을 아직 다 고르지 않음
    quantity: number;
    onSale: boolean;
};

// 상품 상세의 구매 버튼 영역.
// - 장바구니 담기: 고른 상품 · 옵션 조합의 재고(inventoryId)를 담는다. 옵션을 다 고르지 않았거나 품절이면 막는다
// - 바로 구매: 주문서 연동(ORD-1) 전이라 비활성
export default function ProductActions({ postId, inventoryId, available, needsOption, quantity, onSale }: Props) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isLoggedIn } = useCurrentUser();
    const addToCart = useAddItem1({
        mutation: {
            // 헤더의 장바구니 개수 등이 바로 갱신되도록 장바구니 조회를 다시 불러온다.
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
        },
    });

    const soldOut = inventoryId !== null && available <= 0;
    const canBuy = onSale && inventoryId !== null && !soldOut;
    // 결과 메시지는 지금 고른 재고 · 수량으로 담았을 때만 보여 준다. (다른 옵션을 고르면 이전 결과를 숨긴다)
    const sent = addToCart.variables?.data;
    const isCurrent = sent?.inventoryId === inventoryId && sent?.quantity === quantity;
    // 401은 전역 만료 처리가 로그인 화면으로 보내므로 따로 표시하지 않는다.
    const showError = addToCart.isError && isCurrent && !(addToCart.error instanceof ApiError && addToCart.error.status === 401);

    const handleAddToCart = () => {
        if (inventoryId === null) return;
        if (!isLoggedIn) {
            router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.product(postId))}`);
            return;
        }
        addToCart.mutate({ data: { inventoryId, quantity } });
    };

    return (
        <div className="flex flex-col gap-3 pt-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                    label="장바구니 담기"
                    variant="secondary"
                    size="lg"
                    width="100%"
                    icon={<Icon name="shopping_cart" />}
                    isDisabled={!canBuy}
                    isLoading={addToCart.isPending}
                    onClick={handleAddToCart}
                />
                {onSale ? <Button label="공동구매 시작하기" href={ROUTES.groupPurchaseNew} as={Link} variant="primary" size="lg" width="100%" icon={<Icon name="group_add" />} /> : <Button label="공동구매 시작하기" variant="primary" size="lg" width="100%" icon={<Icon name="group_add" />} isDisabled tooltip="판매 중인 상품만 공동구매를 시작할 수 있습니다" />}
            </div>
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
            {!onSale && <Text type="supporting" color="secondary">현재 판매하지 않는 상품은 구매할 수 없습니다.</Text>}
            {onSale && needsOption && <Text type="supporting" color="secondary">옵션을 모두 고르면 장바구니에 담을 수 있습니다.</Text>}
            {onSale && soldOut && <Text type="supporting" className="text-error">품절된 옵션입니다. 다른 옵션을 골라 주세요.</Text>}
        </div>
    );
}
