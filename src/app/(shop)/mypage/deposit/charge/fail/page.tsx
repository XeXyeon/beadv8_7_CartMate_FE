import type { Metadata } from 'next';
import { Suspense } from 'react';
import MyPageShell from '@/components/layout/MyPageShell';
import ChargeFailMessage from './_components/ChargeFailMessage';

export const metadata: Metadata = {
    title: '예치금 충전 실패 | TEAMBUY',
};

// 토스가 결제 실패를 code·message와 함께 돌려보내는 곳. 충전 주문은 대기 상태로 두고 BE는 부르지 않는다.
export default function DepositChargeFailPage() {
    return (
        <MyPageShell title="예치금 충전">
            <Suspense>
                <ChargeFailMessage />
            </Suspense>
        </MyPageShell>
    );
}
