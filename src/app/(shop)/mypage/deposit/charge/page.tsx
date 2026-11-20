import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import ChargeForm from './_components/ChargeForm';

export const metadata: Metadata = {
    title: '예치금 충전 | TEAMBUY',
};

export default function DepositChargePage() {
    return (
        <MyPageShell
            title="예치금 충전"
            description="카드나 간편결제로 예치금을 충전합니다. 한 번에 10,000원부터 1,000,000원까지 1,000원 단위로 충전할 수 있습니다."
        >
            <ChargeForm />
        </MyPageShell>
    );
}
