import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import CouponBox from './_components/CouponBox';

export const metadata: Metadata = {
    title: '쿠폰함 | TEAMBUY',
};

export default function MyCouponsPage() {
    return (
        <MyPageShell title="쿠폰함" description="받은 쿠폰과 지금 받을 수 있는 쿠폰입니다. 쿠폰은 주문 결제 화면에서 고릅니다.">
            <CouponBox />
        </MyPageShell>
    );
}
