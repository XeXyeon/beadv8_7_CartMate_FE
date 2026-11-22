'use client';

import { Banner, Button, Dialog, DialogHeader, Text } from '@astryxdesign/core';
import { useGetAdminWithdrawAccount } from '@/api/generated/admin-wallet-withdraw-controller/admin-wallet-withdraw-controller';
import type { AdminWithdrawOrderResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import { formatPrice } from '@/lib/salesPost';

// 송금할 계좌번호 원문. 열 때마다 서버가 누가 봤는지 기록한다 → 캐시하지 않는다
export default function WithdrawAccountDialog({ order, onClose }: { order: AdminWithdrawOrderResponse; onClose: () => void }) {
    const account = useGetAdminWithdrawAccount(order.withdrawOrderId!, { query: { staleTime: 0, gcTime: 0, retry: false } });
    const data = account.data?.data;

    const copy = (text: string) => {
        void navigator.clipboard?.writeText(text).then(
            () => alert('복사했습니다.'),
            () => alert('복사하지 못했습니다. 직접 선택해 복사해주세요.'),
        );
    };

    return (
        <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={440}>
            <DialogHeader title={`출금 #${order.withdrawOrderId} 송금 계좌`} onOpenChange={(open) => !open && onClose()} />
            <div className="flex flex-col gap-space-md p-space-lg">
                {account.isPending ? (
                    <div className="h-24 rounded bg-surface-container animate-pulse" aria-hidden />
                ) : account.isError || !data ? (
                    <Text type="supporting" color="inherit">
                        <span className="text-error" role="alert">
                            {errorMessage(account.error, '계좌를 불러오지 못했습니다.')}
                        </span>
                    </Text>
                ) : (
                    <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 font-body-md text-body-md">
                        <dt className="text-secondary">은행</dt>
                        <dd className="text-on-surface">{data.bankName}</dd>
                        <dd />
                        <dt className="text-secondary">계좌번호</dt>
                        <dd className="font-mono text-on-surface">{data.accountNumber}</dd>
                        <dd>
                            <Button label="복사" size="sm" variant="secondary" onClick={() => copy(data.accountNumber ?? '')} />
                        </dd>
                        <dt className="text-secondary">예금주</dt>
                        <dd className="text-on-surface">{data.accountHolder}</dd>
                        <dd />
                        <dt className="text-secondary">금액</dt>
                        <dd className="font-semibold text-primary">{formatPrice(data.amount ?? 0)}</dd>
                        <dd>
                            <Button label="복사" size="sm" variant="secondary" onClick={() => copy(String(data.amount ?? ''))} />
                        </dd>
                    </dl>
                )}
                <Banner status="warning" collapsible={false} title="열람 기록이 남습니다" description="계좌번호는 송금에만 쓰고 다른 곳에 옮겨 두지 마세요." />
                <div className="flex justify-end">
                    <Button label="닫기" onClick={onClose} />
                </div>
            </div>
        </Dialog>
    );
}
