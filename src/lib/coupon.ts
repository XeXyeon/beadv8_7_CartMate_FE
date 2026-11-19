import { formatDateTime } from '@/lib/format';
import { formatPrice } from '@/lib/salesPost';

// 쿠폰 표시용 공통 함수. 할인액 계산은 BE(Coupon)만 한다 — 여기서는 문구만 만든다.

type CouponLike = {
    discountType?: string;
    discountValue?: number;
    maxDiscountAmount?: number;
    minOrderAmount?: number;
    scope?: string;
    sellerId?: number;
};

// "3,000원 할인" / "10% 할인"
export function discountLabel(c: CouponLike): string {
    const value = c.discountValue ?? 0;
    return c.discountType === 'RATE' ? `${value}% 할인` : `${formatPrice(value)} 할인`;
}

// 사용 조건 한 줄: "30,000원 이상 · 최대 5,000원 · 판매자 #3 상품"
export function conditionLabel(c: CouponLike): string {
    const parts: string[] = [];
    parts.push((c.minOrderAmount ?? 0) > 0 ? `${formatPrice(c.minOrderAmount ?? 0)} 이상 구매 시` : '금액 조건 없음');
    if (c.discountType === 'RATE' && c.maxDiscountAmount) parts.push(`최대 ${formatPrice(c.maxDiscountAmount)}`);
    parts.push(scopeLabel(c));
    return parts.join(' · ');
}

export function scopeLabel(c: CouponLike): string {
    return c.scope === 'SELLER' ? `판매자 #${c.sellerId ?? '-'} 상품` : '전체 상품';
}

// 받기 전 쿠폰의 사용 기간 안내: 날짜까지 / 받은 날부터 N일
export function usablePeriodLabel(c: { usableUntil?: string; validDays?: number }): string {
    if (c.usableUntil) return `${formatDateTime(c.usableUntil)}까지 사용`;
    if (c.validDays) return `받은 날부터 ${c.validDays}일간 사용`;
    return '';
}

export const MEMBER_COUPON_STATUS: Record<string, { label: string; variant: 'blue' | 'neutral' | 'warning' | 'red' }> = {
    AVAILABLE: { label: '사용 가능', variant: 'blue' },
    RESERVED: { label: '사용 예정', variant: 'warning' },
    USED: { label: '사용 완료', variant: 'neutral' },
    EXPIRED: { label: '기간 만료', variant: 'neutral' },
};
