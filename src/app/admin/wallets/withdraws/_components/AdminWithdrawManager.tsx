'use client';

import { useState } from 'react';
import { Badge, Button, Card, Heading, Text } from '@astryxdesign/core';
import { useQueryClient } from '@tanstack/react-query';
import {
    getGetAdminWithdrawsQueryKey,
    useGetAdminWithdraws,
    useStartAdminWithdraw,
} from '@/api/generated/admin-wallet-withdraw-controller/admin-wallet-withdraw-controller';
import type { AdminWithdrawOrderResponse, GetAdminWithdrawsStatus } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';
import { formatPrice } from '@/lib/salesPost';
import { WITHDRAW_STATUS, withdrawStatusInfo, type WithdrawStatus } from '@/lib/withdraw';
import WithdrawAccountDialog from './WithdrawAccountDialog';
import WithdrawFinishDialog from './WithdrawFinishDialog';

const PAGE_SIZE = 20;
const FILTERS: (WithdrawStatus | 'ALL')[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED', 'ALL'];

type Opened =
    | { kind: 'account'; order: AdminWithdrawOrderResponse }
    | { kind: 'complete' | 'fail'; order: AdminWithdrawOrderResponse }
    | null;

// 예치금 출금 처리 (운영 manual 모드): 대기 건 → 계좌 보기 → 송금 시작 → 은행에서 직접 송금 → 완료(메모) 또는 실패(사유, 잔액 복구).
// 자동 이체 모드에서는 서버가 송금 시작을 막는다(409) — 결과를 오래 모르는 건(확인 필요)만 완료·실패로 확정한다.
export default function AdminWithdrawManager() {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<WithdrawStatus | 'ALL'>('PENDING');
    const [page, setPage] = useState(0);
    const [opened, setOpened] = useState<Opened>(null);

    const list = useGetAdminWithdraws(
        { status: status === 'ALL' ? undefined : (status as GetAdminWithdrawsStatus), page, size: PAGE_SIZE },
        { query: { staleTime: 0 } },
    );
    const orders = list.data?.data?.content ?? [];
    const totalPages = list.data?.data?.totalPages ?? 0;

    const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetAdminWithdrawsQueryKey() });

    const start = useStartAdminWithdraw({
        mutation: {
            onSuccess: refresh,
            onError: (e) => {
                alert(errorMessage(e, '송금을 시작하지 못했습니다.'));
                refresh(); // 그사이 회원이 취소했을 수 있다
            },
        },
    });

    const onStart = (o: AdminWithdrawOrderResponse) => {
        if (o.withdrawOrderId === undefined) return;
        if (confirm(`#${o.withdrawOrderId} ${formatPrice(o.amount ?? 0)} 송금을 시작할까요?\n시작하면 회원이 취소할 수 없습니다. 은행에서 송금한 뒤 완료를 눌러주세요.`)) {
            start.mutate({ withdrawOrderId: o.withdrawOrderId });
        }
    };

    return (
        <div className="flex flex-col gap-space-lg">
            <div>
                <Heading level={1}>출금 처리</Heading>
                <Text display="block" color="secondary" className="mt-2">
                    회원이 신청한 예치금 출금입니다. 잔액은 신청할 때 이미 빠져 있습니다. 실패 처리하면 회원 잔액으로 돌아갑니다.
                </Text>
            </div>

            <div className="flex flex-wrap gap-space-xs" role="group" aria-label="상태">
                {FILTERS.map((f) => (
                    <Button
                        key={f}
                        label={f === 'ALL' ? '전체' : WITHDRAW_STATUS[f].label}
                        size="sm"
                        variant={status === f ? 'primary' : 'secondary'}
                        onClick={() => {
                            setStatus(f);
                            setPage(0);
                        }}
                    />
                ))}
            </div>

            <Card padding={0} className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant font-label-sm text-label-sm">
                            <th className="py-space-sm px-space-md w-16 text-center">번호</th>
                            <th className="py-space-sm px-space-md w-40">신청</th>
                            <th className="py-space-sm px-space-md w-24 text-center">회원</th>
                            <th className="py-space-sm px-space-md w-32 text-right">금액</th>
                            <th className="py-space-sm px-space-md">받는 계좌</th>
                            <th className="py-space-sm px-space-md w-32 text-center">상태</th>
                            <th className="py-space-sm px-space-md w-64 text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="font-body-sm text-body-sm divide-y divide-surface-container">
                        {list.isPending ? (
                            <tr><td colSpan={7} className="py-space-xl text-center text-outline">불러오는 중…</td></tr>
                        ) : list.isError ? (
                            <tr><td colSpan={7} className="py-space-xl text-center text-error">{errorMessage(list.error, '출금 목록을 불러오지 못했습니다.')}</td></tr>
                        ) : orders.length === 0 ? (
                            <tr><td colSpan={7} className="py-space-xl text-center text-outline">해당하는 출금이 없습니다.</td></tr>
                        ) : (
                            orders.map((o) => {
                                const info = withdrawStatusInfo(o.status);
                                const legacy = !o.transferId; // 예전 방식(계좌 없음) 건
                                return (
                                    <tr key={o.withdrawOrderId} className="hover:bg-surface-container-low align-top">
                                        <td className="py-space-sm px-space-md text-center font-mono text-outline">{o.withdrawOrderId}</td>
                                        <td className="py-space-sm px-space-md text-outline">
                                            <div>{formatDateTime(o.requestedAt)}</div>
                                            {o.finishedAt && <div>처리 {formatDateTime(o.finishedAt)}</div>}
                                        </td>
                                        <td className="py-space-sm px-space-md text-center font-mono">{o.memberId}</td>
                                        <td className="py-space-sm px-space-md text-right font-semibold text-on-surface">{formatPrice(o.amount ?? 0)}</td>
                                        <td className="py-space-sm px-space-md">
                                            {legacy ? (
                                                <span className="text-outline">계좌 정보 없음 (예전 방식)</span>
                                            ) : (
                                                <>
                                                    <div className="text-on-surface">{o.bankName} {o.accountNumberMasked}</div>
                                                    <div className="text-outline">예금주 {o.accountHolder}</div>
                                                </>
                                            )}
                                            {o.resultMessage && <div className="text-outline">메모 · 사유: {o.resultMessage}</div>}
                                        </td>
                                        <td className="py-space-sm px-space-md text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <Badge variant={info.variant} label={info.label} />
                                                {o.reviewRequested && <Badge variant="error" label="확인 필요" />}
                                            </div>
                                        </td>
                                        <td className="py-space-sm px-space-md">
                                            <div className="flex flex-wrap justify-center gap-space-xs">
                                                {!legacy && (o.status === 'PENDING' || o.status === 'PROCESSING') && (
                                                    <Button label="계좌 보기" size="sm" variant="secondary" onClick={() => setOpened({ kind: 'account', order: o })} />
                                                )}
                                                {!legacy && o.status === 'PENDING' && (
                                                    <Button label="송금 시작" size="sm" variant="primary" isDisabled={start.isPending} onClick={() => onStart(o)} />
                                                )}
                                                {o.status === 'PROCESSING' && (
                                                    <Button label="완료" size="sm" variant="primary" onClick={() => setOpened({ kind: 'complete', order: o })} />
                                                )}
                                                {(o.status === 'PENDING' || o.status === 'PROCESSING') && (
                                                    <Button label="실패" size="sm" variant="destructive" onClick={() => setOpened({ kind: 'fail', order: o })} />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </Card>

            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-space-xs" aria-label="페이지">
                    <Button label="이전 페이지" variant="secondary" size="sm" isIconOnly icon={<Icon name="chevron_left" className="text-[18px]" />} isDisabled={page === 0} onClick={() => setPage((v) => v - 1)} />
                    <Text type="supporting" color="secondary" className="px-space-sm">{page + 1} / {totalPages}</Text>
                    <Button label="다음 페이지" variant="secondary" size="sm" isIconOnly icon={<Icon name="chevron_right" className="text-[18px]" />} isDisabled={page >= totalPages - 1} onClick={() => setPage((v) => v + 1)} />
                </nav>
            )}

            {opened?.kind === 'account' && <WithdrawAccountDialog order={opened.order} onClose={() => setOpened(null)} />}
            {(opened?.kind === 'complete' || opened?.kind === 'fail') && (
                <WithdrawFinishDialog
                    kind={opened.kind}
                    order={opened.order}
                    onClose={() => setOpened(null)}
                    onDone={() => {
                        setOpened(null);
                        refresh();
                    }}
                />
            )}
        </div>
    );
}
