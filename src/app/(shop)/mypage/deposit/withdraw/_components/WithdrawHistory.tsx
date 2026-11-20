'use client';

import { useState } from 'react';
import { Badge, Button, Card, Text } from '@astryxdesign/core';
import type { WalletWithdrawOrderResponse } from '@/api/generated/model';
import { useCancelWithdraw, useGetMyWithdraws } from '@/api/generated/wallet-controller/wallet-controller';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';
import { formatPrice } from '@/lib/salesPost';
import { withdrawStatusInfo } from '@/lib/withdraw';

const PAGE_SIZE = 10;

// 출금 내역: 상태(대기 · 송금 중 · 완료 · 실패 · 취소), 실패 사유. 대기 중인 건만 취소할 수 있다 (송금을 시작하면 돈이 나갔을 수 있다)
export default function WithdrawHistory({ onChanged }: { onChanged: () => void }) {
    const [page, setPage] = useState(0);
    const list = useGetMyWithdraws({ page, size: PAGE_SIZE, sort: ['id,desc'] }, { query: { staleTime: 0 } });
    const withdraws = list.data?.data?.content ?? [];
    const totalPages = list.data?.data?.totalPages ?? 0;

    const cancel = useCancelWithdraw({
        mutation: {
            onSuccess: onChanged,
            onError: (e) => {
                alert(errorMessage(e, '출금을 취소하지 못했습니다.'));
                onChanged(); // 그사이 송금이 시작됐을 수 있다
            },
        },
    });

    const handleCancel = (w: WalletWithdrawOrderResponse) => {
        if (w.withdrawOrderId !== undefined && confirm(`${formatPrice(w.amount ?? 0)} 출금을 취소할까요? 금액은 예치금 잔액으로 돌아옵니다.`)) {
            cancel.mutate({ withdrawOrderId: w.withdrawOrderId });
        }
    };

    return (
        <Card padding={5} className="flex flex-col gap-3">
            <Text weight="semibold">출금 내역</Text>

            {list.isPending ? (
                <div className="h-16 rounded bg-surface-container animate-pulse" aria-hidden />
            ) : list.isError ? (
                <Text type="supporting" color="inherit">
                    <span className="text-error">{errorMessage(list.error, '출금 내역을 불러오지 못했습니다.')}</span>
                </Text>
            ) : withdraws.length === 0 ? (
                <Text type="supporting">출금한 내역이 없습니다.</Text>
            ) : (
                <ul className="flex flex-col divide-y divide-surface-container border border-outline-variant rounded">
                    {withdraws.map((w) => {
                        const status = withdrawStatusInfo(w.status);
                        return (
                            <li key={w.withdrawOrderId} className="flex flex-wrap items-center justify-between gap-space-sm p-space-md">
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-space-xs">
                                        <span className="font-label-md text-label-md text-on-surface font-semibold">{formatPrice(w.amount ?? 0)}</span>
                                        <Badge variant={status.variant} label={status.label} />
                                    </div>
                                    <span className="font-caption text-caption text-outline">
                                        {formatDateTime(w.requestedAt)}
                                        {w.bankName && ` · ${w.bankName} ${w.accountNumberMasked ?? ''}`}
                                        {w.finishedAt && ` · 처리 ${formatDateTime(w.finishedAt)}`}
                                    </span>
                                    {w.status === 'FAILED' && (
                                        <span className="font-caption text-caption text-error">
                                            {w.resultMessage ?? '송금하지 못했습니다.'} 금액은 잔액으로 돌아왔습니다.
                                        </span>
                                    )}
                                </div>
                                {w.status === 'PENDING' && (
                                    <Button label="취소" variant="secondary" size="sm" isDisabled={cancel.isPending} onClick={() => handleCancel(w)} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-space-xs" aria-label="출금 내역 페이지">
                    <Button
                        label="이전 페이지"
                        variant="secondary"
                        size="sm"
                        isIconOnly
                        icon={<Icon name="chevron_left" className="text-[18px]" />}
                        isDisabled={page === 0}
                        onClick={() => setPage((v) => v - 1)}
                    />
                    <Text type="supporting" color="secondary" className="px-space-sm">
                        {page + 1} / {totalPages}
                    </Text>
                    <Button
                        label="다음 페이지"
                        variant="secondary"
                        size="sm"
                        isIconOnly
                        icon={<Icon name="chevron_right" className="text-[18px]" />}
                        isDisabled={page >= totalPages - 1}
                        onClick={() => setPage((v) => v + 1)}
                    />
                </nav>
            )}
        </Card>
    );
}
