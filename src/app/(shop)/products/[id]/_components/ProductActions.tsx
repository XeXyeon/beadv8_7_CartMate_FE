'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { getGetCartQueryKey, useAddItem1 } from '@/api/generated/cart-controller/cart-controller';
import { ApiError, errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { useCurrentUser, useMySellerId } from '@/lib/auth';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';

type Props = {
    postId: number;
    sellerId: number | undefined; // 판매글의 판매자 번호(seller.id)
    inventoryId: number | null; // 고른 상품 · 옵션 조합의 재고. 아직 다 고르지 않았으면 null
    available: number; // 그 재고의 구매 가능 수량
    quantity: number;
    onSale: boolean;
    // 고른 재고 · 수량의 합계. 모바일 하단 바에 보여 준다. 옵션을 다 고르지 않았거나 가격 문의면 null
    total: number | null;
};

// 상품 상세의 구매 버튼 영역.
// - 장바구니 담기: 고른 상품 · 옵션 조합의 재고(inventoryId)를 담는다. 옵션을 다 고르지 않았거나 품절이면 막는다
// - 바로 구매: 장바구니를 거치지 않는다. 고른 재고 · 수량을 싣고 주문서로 가서, 배송지를 받은 뒤 바로 주문을 만든다
export default function ProductActions({ postId, sellerId, inventoryId, available, quantity, onSale, total }: Props) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isLoggedIn, isLoading: userLoading } = useCurrentUser();
    const { sellerId: mySellerId } = useMySellerId();
    const addToCart = useAddItem1({
        mutation: {
            // 헤더의 장바구니 개수 등이 바로 갱신되도록 장바구니 조회를 다시 불러온다.
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
        },
    });

    const soldOut = inventoryId !== null && available <= 0;
    // 판매자는 자기 상품을 살 수 없다(BE가 막는다). 눌러 보고 에러를 받기 전에 버튼을 끈다.
    // 판매글의 sellerId는 판매자 번호(seller.id)라서 회원 번호가 아니라 내 판매자 번호와 비교한다
    const isMyPost = mySellerId != null && sellerId != null && mySellerId === sellerId;
    const canBuy = onSale && inventoryId !== null && !soldOut && !isMyPost;
    // 결과 메시지는 지금 고른 재고 · 수량으로 담았을 때만 보여 준다. (다른 옵션을 고르면 이전 결과를 숨긴다)
    const sent = addToCart.variables?.data;
    const isCurrent = sent?.inventoryId === inventoryId && sent?.quantity === quantity;
    // 401은 전역 만료 처리가 로그인 화면으로 보내므로 따로 표시하지 않는다.
    const showError = addToCart.isError && isCurrent && !(addToCart.error instanceof ApiError && addToCart.error.status === 401);

    // 로그인 확인 전(서버 렌더 화면을 이어받는 중 포함)에는 로그인 화면으로 보내지 않는다. 비로그인이면 로그인 뒤 이 상품으로 돌아온다.
    // 바로 구매였으면 고른 재고 · 수량을 돌아올 주소에 싣고, 이 탭의 sessionStorage에도 같은 값을 표시로 남긴다.
    // 돌아온 뒤 주소와 표시가 맞을 때만 이어서 주문서로 보낸다(ISS-27). 남이 보낸 링크만으로 주문서가 열리지 않게 한다
    const requireLogin = (buyNowIntent?: { inventoryId: number; quantity: number }) => {
        if (userLoading) return true;
        if (!isLoggedIn) {
            if (buyNowIntent) saveBuyNowMark({ postId, ...buyNowIntent });
            const back = buyNowIntent
                ? `${ROUTES.product(postId)}?${BUY_NOW_PARAM}=${buyNowIntent.inventoryId}&${BUY_NOW_QTY_PARAM}=${buyNowIntent.quantity}`
                : ROUTES.product(postId);
            router.push(`${ROUTES.login}?next=${encodeURIComponent(back)}`);
            return true;
        }
        return false;
    };

    const handleAddToCart = () => {
        if (inventoryId === null || requireLogin()) return;
        addToCart.mutate({ data: { inventoryId, quantity } });
    };

    // 주문서로 이동만 한다. 주문은 주문서에서 배송지를 받은 뒤 만든다
    const startBuyNow = (item: BuyNowItem) => {
        router.push(ROUTES.checkoutBuyNow(postId, item.inventoryId, item.quantity));
    };
    const handleBuyNow = () => {
        if (inventoryId === null || requireLogin({ inventoryId, quantity })) return;
        startBuyNow({ inventoryId, quantity });
    };

    // 로그인 뒤 바로 구매 의도를 싣고 돌아왔으면 한 번만 이어서 주문서로 보낸다. 주소의 의도와 표시는 실행 여부와 상관없이 먼저 지워
    // 새로고침 · 뒤로 가기로 주문서가 다시 열리지 않게 한다. 표시가 없거나(남이 보낸 링크) 값이 다르거나 만료됐으면 실행하지 않는다.
    // useSearchParams는 Suspense 경계가 필요해(cacheComponents) 마운트 뒤 window.location에서 읽는다
    const resumed = useRef(false);
    useEffect(() => {
        if (resumed.current || userLoading || !isLoggedIn) return;
        const intent = readBuyNowIntent(window.location.search);
        const mark = takeBuyNowMark();
        if (!intent) return;
        resumed.current = true;
        router.replace(ROUTES.product(postId), { scroll: false });
        const matches = mark !== null && mark.postId === postId && mark.inventoryId === intent.inventoryId && mark.quantity === intent.quantity;
        if (matches) startBuyNow(intent);
        // startBuyNow는 렌더마다 새로 만들어지지만 한 번만 실행하므로 의존성에서 뺀다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLoading, isLoggedIn, postId, router]);
    const busy = addToCart.isPending;

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
                    isDisabled={!canBuy}
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
                    onClick={handleBuyNow}
                />
            </div>
            {onSale && !isMyPost ? (
                <Button label="공동구매 시작하기" href={ROUTES.groupPurchaseNew} as={Link} variant="secondary" size="lg" width="100%" icon={<Icon name="group_add" />} isDisabled={busy} />
            ) : (
                <Button
                    label="공동구매 시작하기"
                    variant="secondary"
                    size="lg"
                    width="100%"
                    icon={<Icon name="group_add" />}
                    isDisabled
                    tooltip={isMyPost ? '본인 상품으로는 공동구매를 시작할 수 없습니다' : '판매 중인 상품만 공동구매를 시작할 수 있습니다'}
                />
            )}
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
            {isMyPost && <Text type="supporting" color="secondary">본인이 판매하는 상품은 구매할 수 없습니다.</Text>}
            {!isMyPost && !onSale && <Text type="supporting" color="secondary">현재 판매하지 않는 상품은 구매할 수 없습니다.</Text>}
            {!isMyPost && onSale && soldOut && <Text type="supporting" className="text-error">품절된 옵션입니다. 다른 옵션을 골라 주세요.</Text>}
        </div>
    );
}

type BuyNowItem = { inventoryId: number; quantity: number };

// 로그인 뒤 바로 구매를 이어 가기 위한 주소 쿼리. 값이 양의 정수가 아니면 무시한다(재고 · 판매 여부는 BE가 확인한다)
const BUY_NOW_PARAM = 'buyNow';
const BUY_NOW_QTY_PARAM = 'qty';
function readBuyNowIntent(search: string): { inventoryId: number; quantity: number } | null {
    const params = new URLSearchParams(search);
    const inventoryId = Number(params.get(BUY_NOW_PARAM));
    const quantity = Number(params.get(BUY_NOW_QTY_PARAM));
    if (!Number.isInteger(inventoryId) || inventoryId <= 0 || !Number.isInteger(quantity) || quantity <= 0) return null;
    return { inventoryId, quantity };
}

// 이 탭에서 직접 바로 구매를 눌러 로그인 화면으로 갔다는 표시. 로그인(2차 인증 포함)에 넉넉한 시간만 유효하다.
// 저장소를 못 쓰면(사생활 보호 모드 등) 표시가 없어 이어서 실행되지 않고 상품 상세에 머문다
const BUY_NOW_MARK_KEY = 'cartmate.buyNowAfterLogin';
const BUY_NOW_MARK_TTL_MS = 10 * 60 * 1000;
type BuyNowMark = { postId: number; inventoryId: number; quantity: number };
function saveBuyNowMark(mark: BuyNowMark) {
    try {
        sessionStorage.setItem(BUY_NOW_MARK_KEY, JSON.stringify({ ...mark, expiresAt: Date.now() + BUY_NOW_MARK_TTL_MS }));
    } catch {
        // 저장하지 못하면 로그인 뒤 이어서 실행하지 않는다
    }
}
// 표시를 읽고 바로 지운다. 만료됐거나 모양이 다르면 null
function takeBuyNowMark(): BuyNowMark | null {
    try {
        const raw = sessionStorage.getItem(BUY_NOW_MARK_KEY);
        sessionStorage.removeItem(BUY_NOW_MARK_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as Partial<BuyNowMark & { expiresAt: number }>;
        if (typeof v.expiresAt !== 'number' || v.expiresAt < Date.now()) return null;
        if (typeof v.postId !== 'number' || typeof v.inventoryId !== 'number' || typeof v.quantity !== 'number') return null;
        return { postId: v.postId, inventoryId: v.inventoryId, quantity: v.quantity };
    } catch {
        return null;
    }
}
