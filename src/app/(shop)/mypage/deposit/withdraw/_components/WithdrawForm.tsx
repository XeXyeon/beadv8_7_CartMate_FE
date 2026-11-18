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
    walletWithdrawConfirm,
    walletWithdrawOrder,
} from '@/api/generated/wallet-controller/wallet-controller';
import { ApiError, errorMessage } from '@/api/http';
import { INPUT_CLASS } from '@/app/(shop)/checkout/_components/DeliveryAddressFields';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';

type Step =
    | { kind: 'input' }
    // 출금 요청(PENDING)이 만들어졌고 아직 잔액은 그대로다. 확정해야 잔액이 줄어든다.
    // balanceBefore: 요청할 때의 사용 가능 금액. 확정 결과를 모른 채 잔액을 다시 받으면 이미 빠진 금액을 또 빼게 되므로 고정해 둔다.
    | { kind: 'confirm'; withdrawOrderId: number; amount: number; balanceBefore?: number }
    | { kind: 'done'; amount: number; balance?: number };

// 출금은 두 단계다: 요청(walletWithdrawOrder)으로 출금 건을 만들고, 확인 화면에서 확정(walletWithdrawConfirm)하면 잔액이 줄어든다.
// 두 번 나가지 않게 하는 장치:
// - 요청: 같은 금액의 재시도는 같은 멱등성 키를 보내 BE가 같은 출금 건을 돌려준다. 금액을 바꾸면 새 키를 만든다.
// - 확정: 같은 출금 건을 다시 확정해도 BE는 이미 완료된 건을 그대로 성공으로 돌려주고 다시 빼지 않는다.
// - 화면: 요청 · 확정 중에는 버튼을 막고, 진행 중 플래그(ref)로 같은 렌더 안의 연속 클릭도 막는다.
export default function WithdrawForm() {
    const queryClient = useQueryClient();
    const wallet = useGetMyWallet();
    const balance = wallet.data?.data?.balance;
    const [amount, setAmount] = useState<number | null>(null);
    const [step, setStep] = useState<Step>({ kind: 'input' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef(false);
    // 금액별 멱등성 키. 같은 금액으로 다시 요청하면(응답 유실 · 뒤로 갔다 다시 요청) 같은 출금 건을 받는다.
    const keyRef = useRef<{ amount: number; key: string } | null>(null);

    const amountError = validateWithdrawAmount(amount, balance);

    async function handleRequest() {
        if (inFlightRef.current || amount === null || amountError) return;
        inFlightRef.current = true;
        setSubmitting(true);
        setError(null);
        try {
            if (keyRef.current?.amount !== amount) keyRef.current = { amount, key: crypto.randomUUID() };
            const res = await walletWithdrawOrder({ amount, idempotencyKey: keyRef.current.key });
            const withdrawOrderId = res.data?.withdrawOrderId;
            if (withdrawOrderId === undefined) throw new Error('출금 요청을 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
            setStep({ kind: 'confirm', withdrawOrderId, amount: res.data?.amount ?? amount, balanceBefore: balance });
        } catch (e) {
            setError(withdrawErrorMessage(e, '출금 요청을 만들지 못했습니다. 잠시 후 다시 시도해주세요.'));
            // 잔액이 모자라다는 답이면 화면의 잔액이 낡았을 수 있다
            void wallet.refetch();
        } finally {
            inFlightRef.current = false;
            setSubmitting(false);
        }
    }

    async function handleConfirm() {
        if (inFlightRef.current || step.kind !== 'confirm') return;
        inFlightRef.current = true;
        setSubmitting(true);
        setError(null);
        try {
            const res = await walletWithdrawConfirm({ withdrawOrderId: step.withdrawOrderId });
            // 이 출금 건은 끝났으므로 다음 출금은 새 키로 요청한다
            keyRef.current = null;
            setStep({ kind: 'done', amount: step.amount, balance: res.data?.balance });
            void queryClient.invalidateQueries({ queryKey: getGetMyWalletQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getGetMyWalletTransactionsQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getGetMyWalletTransactionSummaryQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getMyPageDashboardQueryKey() });
        } catch (e) {
            if (isUnknownResult(e)) {
                // 출금 건 단위로 멱등이라 다시 확정해도 한 번만 빠진다. 이미 처리됐다면 다시 확정하면 성공으로 돌아온다.
                setError('출금 결과를 확인하지 못했습니다. 다시 확정해도 한 번만 출금됩니다. 계속 실패하면 예치금 내역을 확인해주세요.');
            } else {
                // BE가 거절한 출금 건(실패 · 취소 · 잔액 부족 등)은 다시 눌러도 같은 답이므로 입력 단계로 돌아가고,
                // 같은 키로 다시 요청하면 그 건을 또 받으므로 다음 요청은 새 키로 한다.
                keyRef.current = null;
                setStep({ kind: 'input' });
                setError(withdrawErrorMessage(e, '출금을 확정하지 못했습니다. 금액을 확인한 뒤 다시 요청해주세요.'));
                void wallet.refetch();
            }
        } finally {
            inFlightRef.current = false;
            setSubmitting(false);
        }
    }

    if (step.kind === 'done') {
        const balanceText = step.balance === undefined ? '' : ` 남은 사용 가능 금액은 ${formatPrice(step.balance)}입니다.`;
        return (
            <Card padding={5}>
                <EmptyState
                    title="출금이 완료되었습니다"
                    description={`${formatPrice(step.amount)}을 출금했습니다.${balanceText}`}
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
                        <dt className="text-secondary">출금 전 사용 가능 금액</dt>
                        <dd className="text-right text-on-surface">{before === undefined ? '-' : formatPrice(before)}</dd>
                        <dt className="text-secondary">출금 후 사용 가능 금액</dt>
                        <dd className="text-right font-semibold text-primary">
                            {after === undefined ? '-' : formatPrice(after)}
                        </dd>
                    </dl>
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
                        isDisabled={submitting}
                        onClick={() => {
                            setError(null);
                            setStep({ kind: 'input' });
                        }}
                    />
                    <Button
                        label="출금 확정"
                        variant="primary"
                        isDisabled={submitting}
                        isLoading={submitting}
                        onClick={handleConfirm}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-6">
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

            <Button
                label="출금 요청"
                variant="primary"
                isDisabled={wallet.isPending || amountError !== null || submitting}
                isLoading={submitting}
                onClick={handleRequest}
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

// 응답을 받지 못했거나 서버 오류라 출금 확정 여부를 모르는 경우
function isUnknownResult(error: unknown): boolean {
    if (!(error instanceof ApiError)) return true;
    return error.status === 0 || error.status >= 500;
}

function withdrawErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        const code = error.resultCode ?? '';
        if (code.endsWith('WALLET_INSUFFICIENT_BALANCE')) return '사용 가능 금액이 모자라 출금할 수 없습니다. 금액을 다시 확인해주세요.';
        if (code.endsWith('WALLET_INVALID_AMOUNT')) return '출금 금액이 올바르지 않습니다.';
        return errorMessage(error, fallback);
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}
