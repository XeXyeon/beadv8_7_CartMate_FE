import type { Metadata } from 'next';
import { Suspense } from 'react';
import MyPageShell from '@/components/layout/MyPageShell';
import ChargeConfirm from './_components/ChargeConfirm';

export const metadata: Metadata = {
    title: '예치금 충전 결과 | TEAMBUY',
};

// 토스가 결제 인증을 마치고 paymentKey·orderId·amount를 붙여 돌려보내는 곳.
// 쿼리를 읽는 부분만 클라이언트에서 렌더링되도록 Suspense로 감싼다.
export default function DepositChargeSuccessPage() {
    return (
        <MyPageShell title="예치금 충전">
            <Suspense>
                <ChargeConfirm />
            </Suspense>
        </MyPageShell>
    );
}
