import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import WithdrawForm from './_components/WithdrawForm';

export const metadata: Metadata = {
    title: '예치금 출금 | TEAMBUY',
};

export default function DepositWithdrawPage() {
    return (
        <MyPageShell title="예치금 출금" description="등록한 본인 계좌로 예치금을 돌려받습니다. 신청하면 잔액에서 바로 빠지고, 송금이 실패하면 돌아옵니다.">
            <WithdrawForm />
        </MyPageShell>
    );
}
