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

// 구매자 화면은 판매자 번호를 알아볼 수 없어 "판매자 전용"으로 보이고, 관리자 화면만 번호를 보인다.
// 상품 상세는 그 판매자의 쿠폰만 나오므로 "이 판매자 상품 전용"으로 보인다.
export type CouponScopeView = 'buyer' | 'sellerPage' | 'admin';

// 사용 조건 한 줄: "30,000원 이상 구매 시 · 최대 5,000원 · 판매자 전용"
export function conditionLabel(c: CouponLike, view: CouponScopeView = 'buyer'): string {
    const parts: string[] = [];
    parts.push((c.minOrderAmount ?? 0) > 0 ? `${formatPrice(c.minOrderAmount ?? 0)} 이상 구매 시` : '금액 조건 없음');
    if (c.discountType === 'RATE' && c.maxDiscountAmount) parts.push(`최대 ${formatPrice(c.maxDiscountAmount)}`);
    parts.push(scopeLabel(c, view));
    return parts.join(' · ');
}

export function scopeLabel(c: CouponLike, view: CouponScopeView = 'buyer'): string {
    if (c.scope !== 'SELLER') return '전체 상품';
    if (view === 'admin') return `판매자 #${c.sellerId ?? '-'} 상품`;
    return view === 'sellerPage' ? '이 판매자 상품 전용' : '판매자 전용';
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
