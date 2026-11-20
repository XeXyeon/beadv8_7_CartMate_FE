import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import WithdrawForm from './_components/WithdrawForm';

export const metadata: Metadata = {
    title: '예치금 출금 | TEAMBUY',
};

export default function DepositWithdrawPage() {
    return (
        <MyPageShell title="예치금 출금" description="사용 가능한 예치금 안에서 출금할 금액을 정하고, 확인한 뒤 출금합니다.">
            <WithdrawForm />
        </MyPageShell>
    );
}
