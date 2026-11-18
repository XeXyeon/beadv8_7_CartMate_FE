import type { Metadata } from 'next';
import { Button } from '@astryxdesign/core/Button';
import MyPageShell from '@/components/layout/MyPageShell';
import { ROUTES } from '@/lib/routes';
import DepositBalanceCard from './_components/DepositBalanceCard';
import RecentTransactions from './_components/RecentTransactions';

export const metadata: Metadata = {
    title: '예치금 관리 | TEAMBUY',
};

export default function DepositPage() {
    return (
        <MyPageShell
            title="예치금 관리"
            description="예치금 잔액과 최근 거래 내역을 확인하고, 충전하거나 출금합니다."
            headerActions={
                <div className="flex gap-2">
                    <Button label="출금하기" href={ROUTES.depositWithdraw} variant="secondary" />
                    <Button label="충전하기" href={ROUTES.depositCharge} variant="primary" />
                </div>
            }
        >
            <div className="flex w-full flex-col gap-6">
                {/* 잔액: 주소와 무관하게 로그인한 회원의 지갑을 조회한다 */}
                <DepositBalanceCard />

                {/* Recent Transactions: BE 거래 내역(최신순) */}
                <RecentTransactions />
            </div>
        </MyPageShell>
    );
}
