import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import WithdrawForm from './_components/WithdrawForm';

export const metadata: Metadata = {
    title: '예치금 출금 | TEAMBUY',
};

export default function DepositWithdrawPage() {
    return (
        <MyPageShell title="예치금 출금" description="출금 계좌를 등록하고, 사용 가능한 예치금 안에서 출금을 신청합니다.">
            <WithdrawForm />
        </MyPageShell>
    );
}
