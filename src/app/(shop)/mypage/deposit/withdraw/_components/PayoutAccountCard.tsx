'use client';

import { useState } from 'react';
import { Button, Card, Text } from '@astryxdesign/core';
import type { PayoutAccountResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import PayoutAccountDialog from './PayoutAccountDialog';

type Props = {
    account: PayoutAccountResponse | null | undefined;
    isPending: boolean;
    error: unknown;
};

// 출금 계좌 (돈을 받을 본인 계좌). 없으면 등록, 있으면 변경
export default function PayoutAccountCard({ account, isPending, error }: Props) {
    const [open, setOpen] = useState(false);

    return (
        <Card padding={5} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <Text weight="semibold">출금 계좌</Text>
                {!isPending && !error && (
                    <Button label={account ? '계좌 변경' : '출금 계좌 등록'} variant={account ? 'secondary' : 'primary'} size="sm" onClick={() => setOpen(true)} />
                )}
            </div>

            {isPending ? (
                <div className="h-10 rounded bg-surface-container animate-pulse" aria-hidden />
            ) : error ? (
                <Text type="supporting" color="inherit">
                    <span className="text-error" role="alert">
                        {errorMessage(error, '출금 계좌를 불러오지 못했습니다.')}
                    </span>
                </Text>
            ) : account ? (
                <div className="flex items-center gap-space-sm">
                    <Icon name="account_balance" className="text-[22px] text-outline" />
                    <div className="flex flex-col">
                        <span className="font-label-md text-label-md text-on-surface font-semibold">
                            {account.bankName} {account.maskedAccountNumber}
                        </span>
                        <span className="font-caption text-caption text-outline">예금주 {account.accountHolder}</span>
                    </div>
                </div>
            ) : (
                <Text type="supporting">출금하려면 먼저 본인 명의 계좌를 등록해주세요. 이메일 인증 후 등록할 수 있습니다.</Text>
            )}

            {open && <PayoutAccountDialog isChange={!!account} onClose={() => setOpen(false)} />}
        </Card>
    );
}
