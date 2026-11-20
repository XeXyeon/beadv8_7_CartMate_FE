'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Text } from '@astryxdesign/core/Text';
import { getMyPageDashboardQueryKey } from '@/api/generated/member-controller/member-controller';
import {
    getGetMyWalletQueryKey,
    getGetMyWalletTransactionSummaryQueryKey,
    getGetMyWalletTransactionsQueryKey,
    useGetMyWallet,
} from '@/api/generated/wallet-controller/wallet-controller';
import { ApiError, errorMessage } from '@/api/http';
import { MY_PAYOUT_ACCOUNT_KEY, requestWithdraw, useMyPayoutAccount, type WithdrawStatus } from '@/api/payout';
import { INPUT_CLASS } from '@/app/(shop)/checkout/_components/DeliveryAddressFields';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';
import PayoutAccountSection from './PayoutAccountSection';

type Step =
    | { kind: 'input' }
    // 신청 전 확인. 아직 BE에 보내지 않았다.
    // balanceBefore: 확인 화면에 들어올 때의 사용 가능 금액(신청 뒤 잔액을 다시 받아도 보여 줄 값이 바뀌지 않게 고정)
    | { kind: 'confirm'; amount: number; balanceBefore?: number }
    | { kind: 'done'; amount: number; status: WithdrawStatus; bankName?: string; accountNumberMasked?: string };

// 출금은 신청 한 번이다: BE가 신청을 받으면 바로 잔액을 빼고(PENDING) 이체는 따로 처리한다. (QA-3#1)
// 확인 화면은 화면 안에서만 거치고, "출금 신청"을 누를 때 한 번만 BE를 부른다.
// 두 번 나가지 않게 하는 장치:
// - 같은 금액의 재시도(응답 유실 · 서버 오류)는 같은 멱등성 키를 보내 BE가 같은 출금 건을 돌려준다. 금액을 바꾸면 새 키를 만든다.
// - 결과를 모르는 신청이 있으면(unresolved) 그 금액으로만 다시 신청할 수 있다. 금액을 바꾸면 새 키라 첫 신청이 처리됐을 때 한 번 더 나간다.
// - 신청 중에는 버튼을 막고, 진행 중 플래그(ref)로 같은 렌더 안의 연속 클릭도 막는다.
export default function WithdrawForm() {
    const queryClient = useQueryClient();
    const wallet = useGetMyWallet();
    const balance = wallet.data?.data?.balance;
    const payout = useMyPayoutAccount();
    const account = payout.data;
    const [amount, setAmount] = useState<number | null>(null);
    const [step, setStep] = useState<Step>({ kind: 'input' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // 결과를 모르는 출금 신청의 금액. 있는 동안은 금액을 바꿀 수 없다
    const [unresolved, setUnresolved] = useState<number | null>(null);
    const inFlightRef = useRef(false);
    // 금액별 멱등성 키. 같은 금액으로 다시 신청하면(응답 유실 · 서버 오류) 같은 출금 건을 받는다.
    const keyRef = useRef<{ amount: number; key: string } | null>(null);

    const amountError = validateWithdrawAmount(amount, balance);
    const noAccount = account === null;

    function refreshWallet() {
        void queryClient.invalidateQueries({ queryKey: getGetMyWalletQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMyWalletTransactionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMyWalletTransactionSummaryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getMyPageDashboardQueryKey() });
    }

    async function handleSubmit() {
        if (inFlightRef.current || step.kind !== 'confirm') return;
        inFlightRef.current = true;
        setSubmitting(true);
        setError(null);
        const target = step.amount;
        try {
            if (keyRef.current?.amount !== target) keyRef.current = { amount: target, key: crypto.randomUUID() };
            const res = await requestWithdraw({ amount: target, idempotencyKey: keyRef.current.key });
            const order = res.data;
            if (!order?.withdrawOrderId) throw new Error('출금 신청 결과를 받지 못했습니다. 예치금 내역을 확인해주세요.');
            // 이 출금 건은 끝났으므로 다음 출금은 새 키로 신청한다
            keyRef.current = null;
            setUnresolved(null);
            refreshWallet();
            if (order.status === 'FAILED' || order.status === 'CANCELED') {
                // 돈이 나가지 않았고 잔액도 돌아왔다
                setStep({ kind: 'input' });
                setError(order.resultMessage || '출금하지 못했습니다. 잠시 후 다시 신청해주세요.');
                return;
            }
            // 받는 계좌는 BE가 신청 때 고정한 값(출금 건)을 보인다
            setStep({
                kind: 'done',
                amount: order.amount ?? target,
                status: order.status,
                bankName: order.bankName,
                accountNumberMasked: order.accountNumberMasked,
            });
        } catch (e) {
            if (isUnknownResult(e)) {
                // 같은 금액으로 다시 신청하면 같은 키를 보내므로 한 번만 빠진다. 처리됐을 수 있으니 잔액 · 내역을 다시 받는다
                setUnresolved(target);
                refreshWallet();
                setError('출금 신청 결과를 확인하지 못했습니다. 같은 금액으로 다시 신청해도 한 번만 출금됩니다. 계속 실패하면 예치금 내역을 확인해주세요.');
            } else {
                // BE가 거절했다(잔액 부족 · 계좌 없음 등). 같은 키로 다시 보내도 같은 답이라 다음 신청은 새 키로 한다
                keyRef.current = null;
                setUnresolved(null);
                setStep({ kind: 'input' });
                setError(withdrawErrorMessage(e, '출금을 신청하지 못했습니다. 금액을 확인한 뒤 다시 신청해주세요.'));
                void wallet.refetch();
                if (e instanceof ApiError && e.resultCode?.endsWith('WALLET_PAYOUT_ACCOUNT_REQUIRED')) {
                    void queryClient.invalidateQueries({ queryKey: MY_PAYOUT_ACCOUNT_KEY });
                }
            }
        } finally {
            inFlightRef.current = false;
            setSubmitting(false);
        }
    }

    if (step.kind === 'done') {
        const completed = step.status === 'COMPLETED';
        const where = step.bankName ? ` ${step.bankName} ${step.accountNumberMasked ?? ''} 계좌로` : '';
        return (
            <Card padding={5}>
                <EmptyState
                    title={completed ? '출금이 완료되었습니다' : '출금을 신청했습니다'}
                    description={
                        completed
                            ? `${formatPrice(step.amount)}을${where} 출금했습니다.`
                            : `${formatPrice(step.amount)}을 예치금에서 출금했습니다.${where} 보내는 중이며, 처리 결과는 예치금 내역에서 확인할 수 있습니다.`
                    }
                    icon={<Icon name="check_circle" />}
                    actions={
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button label="예치금 관리로 가기" href={ROUTES.deposit} variant="primary" />
                            <Button label="예치금 내역 보기" href={ROUTES.depositHistory} variant="secondary" />
                        </div>
                    }
                />
            </Card>
        );
    }

    // 이미 받은 잔액이 있으면 다시 받기에 실패해도 진행 중인 화면(특히 확인 단계)을 오류 카드로 덮지 않는다
    if (wallet.isError && wallet.data === undefined) {
        return (
            <Card variant="red" padding={4} className="flex flex-col gap-3" role="alert">
                <Text>{errorMessage(wallet.error, '예치금 잔액을 불러오지 못했습니다.')}</Text>
                <Button label="다시 시도" variant="secondary" size="sm" onClick={() => wallet.refetch()} />
            </Card>
        );
    }

    if (step.kind === 'confirm') {
        const before = step.balanceBefore;
        const after = before === undefined ? undefined : before - step.amount;
        return (
            <div className="flex w-full flex-col gap-6">
                <Card padding={5} className="flex flex-col gap-4">
                    <Text weight="semibold">출금 내용을 확인해주세요</Text>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-body-md text-body-md">
                        <dt className="text-secondary">출금 금액</dt>
                        <dd className="text-right font-semibold text-on-surface">{formatPrice(step.amount)}</dd>
                        <dt className="text-secondary">받는 계좌</dt>
                        <dd className="text-right text-on-surface">
                            {account ? `${account.bankName} ${account.maskedAccountNumber} · ${account.accountHolder}` : '-'}
                        </dd>
                        <dt className="text-secondary">출금 전 사용 가능 금액</dt>
                        <dd className="text-right text-on-surface">{before === undefined ? '-' : formatPrice(before)}</dd>
                        <dt className="text-secondary">출금 후 사용 가능 금액</dt>
                        <dd className="text-right font-semibold text-primary">
                            {after === undefined ? '-' : formatPrice(after)}
                        </dd>
                    </dl>
                    <Text type="supporting">신청하면 예치금에서 바로 빠지고, 위 계좌로 보내 드립니다.</Text>
                </Card>

                {error ? (
                    <Card variant="red" padding={3} role="alert">
                        <Text>{error}</Text>
                    </Card>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button
                        label="금액 다시 입력"
                        variant="secondary"
                        isDisabled={submitting || unresolved !== null}
                        onClick={() => {
                            setError(null);
                            setStep({ kind: 'input' });
                        }}
                    />
                    <Button
                        label="출금 신청"
                        variant="primary"
                        isDisabled={submitting || !account}
                        isLoading={submitting}
                        onClick={handleSubmit}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <PayoutAccountSection account={account} isLoading={payout.isPending} loadError={payout.error} onRetry={() => payout.refetch()} />

            <Card padding={5} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <label htmlFor="withdraw-amount" className="font-label-md text-label-md text-on-surface">
                        출금 금액
                    </label>
                    <span className="font-body-sm text-body-sm text-secondary">
                        사용 가능 금액 <strong className="text-primary">{balance === undefined ? '-' : formatPrice(balance)}</strong>
                    </span>
                </div>
                <div className="flex gap-2">
                    <input
                        id="withdraw-amount"
                        className={`${INPUT_CLASS} flex-1`}
                        inputMode="numeric"
                        placeholder="출금할 금액"
                        disabled={submitting}
                        value={amount === null ? '' : amount.toLocaleString('ko-KR')}
                        onChange={(e) => {
                            // 15자리를 넘으면 정수로 정확히 다룰 수 없어 자른다
                            const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 15);
                            setAmount(digits ? Number(digits) : null);
                        }}
                    />
                    <Button
                        label="전액"
                        variant="secondary"
                        isDisabled={submitting || balance === undefined || balance <= 0}
                        onClick={() => setAmount(balance ?? null)}
                    />
                </div>
                <Text type="supporting" role={amount !== null && amountError ? 'alert' : undefined}>
                    {amount === null ? '출금할 금액을 입력해주세요.' : (amountError ?? `${formatPrice(amount)}을 출금합니다.`)}
                </Text>
            </Card>

            {error ? (
                <Card variant="red" padding={3} role="alert">
                    <Text>{error}</Text>
                </Card>
            ) : null}

            {noAccount ? <Text type="supporting">출금 계좌를 등록하면 출금을 요청할 수 있습니다.</Text> : null}
            <Button
                label="출금 요청"
                variant="primary"
                isDisabled={wallet.isPending || !account || amountError !== null || submitting}
                onClick={() => {
                    if (amount === null || amountError) return;
                    setError(null);
                    setStep({ kind: 'confirm', amount, balanceBefore: balance });
                }}
            />
        </div>
    );
}

// 통과하면 null, 아니면 화면에 보여 줄 이유. BE 규칙: 0원 초과, 사용 가능 금액 이하.
export function validateWithdrawAmount(amount: number | null, balance: number | undefined): string | null {
    if (amount === null || !Number.isSafeInteger(amount)) return '출금할 금액을 입력해주세요.';
    if (amount <= 0) return '1원 이상 출금할 수 있습니다.';
    if (balance === undefined) return '사용 가능 금액을 불러오는 중입니다.';
    if (amount > balance) return `사용 가능 금액(${formatPrice(balance)})보다 많이 출금할 수 없습니다.`;
    return null;
}

// 응답을 받지 못했거나 서버 오류라 출금 신청이 처리됐는지 모르는 경우
function isUnknownResult(error: unknown): boolean {
    if (!(error instanceof ApiError)) return true;
    return error.status === 0 || error.status >= 500;
}

function withdrawErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        const code = error.resultCode ?? '';
        if (code.endsWith('WALLET_INSUFFICIENT_BALANCE')) return '사용 가능 금액이 모자라 출금할 수 없습니다. 금액을 다시 확인해주세요.';
        if (code.endsWith('WALLET_INVALID_AMOUNT')) return '출금 금액이 올바르지 않습니다.';
        if (code.endsWith('WALLET_PAYOUT_ACCOUNT_REQUIRED')) return '출금 계좌를 먼저 등록해주세요.';
        return errorMessage(error, fallback);
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}
