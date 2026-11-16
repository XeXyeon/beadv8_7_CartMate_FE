// 취소 사유 값 → 화면 문구. 판매자·구매자 화면이 함께 쓴다.
// 사유 값은 BE 서비스 사이 계약이라 추가만 된다. 모르는 값이 와도 화면이 깨지지 않게 문구가 없으면 기본 문구를 쓴다.

// 배송(그리고 주문 항목)이 취소된 사유. BE DeliveryCancelReason.
export const DELIVERY_CANCEL_REASON_LABEL: Record<string, string> = {
    BUYER_CANCELED: '구매자 취소',
    SALES_STOPPED: '판매 중지',
    SELLER_OUT_OF_STOCK: '품절·재고 부족',
    SELLER_PRODUCT_ISSUE: '상품 문제 발견',
    SELLER_OTHER: '기타 판매자 사정',
};

// 판매자가 직접 취소할 때 고를 수 있는 사유. 자유 입력 메모는 받지 않는다.
export const SELLER_CANCEL_REASONS = ['SELLER_OUT_OF_STOCK', 'SELLER_PRODUCT_ISSUE', 'SELLER_OTHER'] as const;
export type SellerCancelReason = (typeof SELLER_CANCEL_REASONS)[number];

export function isSellerCancelReason(reason: string | undefined): boolean {
    return (SELLER_CANCEL_REASONS as readonly string[]).includes(reason ?? '');
}

// 판매자 화면용 짧은 사유. 사유가 없는 예전 취소는 null.
export function deliveryCancelLabel(reason: string | undefined): string | null {
    if (!reason) return null;
    return DELIVERY_CANCEL_REASON_LABEL[reason] ?? reason;
}

// 구매자 화면용 사유. 판매자 사유는 "판매자 사정"을 붙여 누가 취소했는지 드러낸다. 사유가 없으면 null.
export function buyerCancelLabel(reason: string | undefined): string | null {
    const label = deliveryCancelLabel(reason);
    if (!label) return null;
    return isSellerCancelReason(reason) ? `판매자 사정 · ${label}` : label;
}

// 개인 주문 전체가 취소된 사유. BE OrderCancelReason.
export const ORDER_CANCEL_MESSAGE: Record<string, string> = {
    BUYER_CANCELED: '구매자가 주문을 취소했습니다.',
    PAYMENT_EXPIRED: '결제 기한이 지나 자동으로 취소되었습니다.',
    OUT_OF_STOCK: '재고가 부족해 취소되었습니다.',
    SALES_STOPPED: '판매자가 판매를 중지해 주문이 취소되었습니다.',
    GROUP_PURCHASE_CLOSED: '공동구매가 마감되어 주문이 취소되었습니다.',
    SELLER_CANCELED: '판매자 사정으로 모든 상품이 취소되었습니다.',
};

// 공동 주문 전체가 취소된 사유. BE SharedGroupOrderCancelReason.
export const SHARED_ORDER_CANCEL_MESSAGE: Record<string, string> = {
    DEADLINE_EXPIRED: '결제 기한 안에 모든 참여자가 결제하지 않아 취소되었습니다.',
    CREATOR_CANCELED: '만든 사람이 공동구매를 취소했습니다.',
    OUT_OF_STOCK: '재고가 부족해 취소되었습니다.',
    SALES_STOPPED: '판매자가 판매를 중지해 공동 주문이 취소되었습니다.',
    SELLER_CANCELED: '판매자 사정으로 모든 상품이 취소되었습니다.',
};

// 일부 상품만 취소된 주문의 안내 제목. 취소 사유가 섞여 있으면 판매자 사유를 앞세운다.
export function partialCancelTitle(reasons: (string | undefined)[]): string {
    if (reasons.some(isSellerCancelReason)) return '일부 상품이 판매자 사정으로 취소되었습니다';
    if (reasons.includes('SALES_STOPPED')) return '일부 상품이 판매 중지로 취소되었습니다';
    return '일부 상품이 취소되었습니다';
}
