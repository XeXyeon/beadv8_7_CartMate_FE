'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Text } from '@astryxdesign/core/Text';
import { getMyPageDashboardQueryKey } from '@/api/generated/member-controller/member-controller';
import { useMyPayoutAccount } from '@/api/generated/member-payout-account-controller/member-payout-account-controller';
import type { WalletWithdrawOrderResponse } from '@/api/generated/model';
import {
    getGetMyWalletQueryKey,
    getGetMyWalletTransactionSummaryQueryKey,
    getGetMyWalletTransactionsQueryKey,
    getGetMyWithdrawsQueryKey,
    useGetMyWallet,
    walletWithdrawOrder,
} from '@/api/generated/wallet-controller/wallet-controller';
import { ApiError, errorMessage } from '@/api/http';
import { INPUT_CLASS } from '@/app/(shop)/checkout/_components/DeliveryAddressFields';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';
import PayoutAccountCard from './PayoutAccountCard';
import WithdrawHistory from './WithdrawHistory';

// 출금은 신청 한 번으로 끝난다: 신청하면 잔액에서 바로 빠지고, 등록된 출금 계좌로 송금된다.
// 송금이 실패하거나 대기 중에 취소하면 잔액으로 돌아온다 (아래 출금 내역에서 상태 확인).
// 두 번 나가지 않게 하는 장치:
// - 같은 금액의 재시도(응답 유실 · 연타)는 같은 멱등성 키를 보내 BE가 처음 건을 돌려준다. 금액을 바꾸면 새 키를 만든다.
// - 화면: 신청 중에는 버튼을 막고, 진행 중 플래그(ref)로 같은 렌더 안의 연속 클릭도 막는다.
export default function WithdrawForm() {
    const queryClient = useQueryClient();
    const wallet = useGetMyWallet();
    const payoutAccount = useMyPayoutAccount({ query: { staleTime: 0 } });
    const account = payoutAccount.data?.data ?? null;
    const balance = wallet.data?.data?.balance;
    const [amount, setAmount] = useState<number | null>(null);
    const [requested, setRequested] = useState<WalletWithdrawOrderResponse | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef(false);
    // 금액별 멱등성 키. 같은 금액으로 다시 신청하면(응답 유실) 같은 출금 건을 받는다.
    const keyRef = useRef<{ amount: number; key: string } | null>(null);

    const amountError = validateWithdrawAmount(amount, balance);

    function refreshWallet() {
        void queryClient.invalidateQueries({ queryKey: getGetMyWalletQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMyWalletTransactionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMyWalletTransactionSummaryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMyWithdrawsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getMyPageDashboardQueryKey() });
    }

    async function handleRequest() {
        if (inFlightRef.current || amount === null || amountError || !account) return;
        inFlightRef.current = true;
        setSubmitting(true);
        setError(null);
        try {
            if (keyRef.current?.amount !== amount) keyRef.current = { amount, key: crypto.randomUUID() };
            const res = await walletWithdrawOrder({ amount, idempotencyKey: keyRef.current.key });
            // 이 출금 건은 끝났으므로 다음 출금은 새 키로 신청한다
            keyRef.current = null;
            setRequested(res.data ?? { amount });
            setAmount(null);
            refreshWallet();
            // 자동 이체면 신청 직후 몇 초 안에 끝난다 → 한 번 더 불러와 완료·실패를 보여 준다
            if (res.data?.status === 'PENDING') setTimeout(refreshWallet, 2000);
        } catch (e) {
            if (isUnknownResult(e)) {
                // 같은 금액으로 다시 신청하면 같은 키라 한 번만 빠진다
                setError('출금 신청 결과를 확인하지 못했습니다. 같은 금액으로 다시 신청해도 한 번만 출금됩니다. 아래 출금 내역도 확인해주세요.');
                refreshWallet();
            } else {
                keyRef.current = null;
                setError(withdrawErrorMessage(e, '출금을 신청하지 못했습니다. 잠시 후 다시 시도해주세요.'));
                // 잔액이 모자라다는 답이면 화면의 잔액이 낡았을 수 있다
                void wallet.refetch();
                void payoutAccount.refetch();
            }
        } finally {
            inFlightRef.current = false;
            setSubmitting(false);
        }
    }

    if (wallet.isError && wallet.data === undefined) {
        return (
            <Card variant="red" padding={4} className="flex flex-col gap-3" role="alert">
                <Text>{errorMessage(wallet.error, '예치금 잔액을 불러오지 못했습니다.')}</Text>
                <Button label="다시 시도" variant="secondary" size="sm" onClick={() => wallet.refetch()} />
            </Card>
        );
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <PayoutAccountCard account={account} isPending={payoutAccount.isPending} error={payoutAccount.isError ? payoutAccount.error : null} />

            {requested ? (
                <Card padding={5}>
                    <EmptyState
                        title={requested.status === 'COMPLETED' ? '출금이 완료되었습니다' : '출금을 신청했습니다'}
                        description={
                            requested.status === 'COMPLETED'
                                ? `${formatPrice(requested.amount ?? 0)}을 ${requested.bankName ?? ''} ${requested.accountNumberMasked ?? ''}(으)로 보냈습니다.`
                                : `${formatPrice(requested.amount ?? 0)}을 ${requested.bankName ?? ''} ${requested.accountNumberMasked ?? ''}(으)로 보냅니다. 송금이 끝나면 출금 내역에 완료로 표시됩니다.`
                        }
                        icon={<Icon name="check_circle" />}
                        actions={
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button label="추가로 출금하기" variant="secondary" onClick={() => setRequested(null)} />
                                <Button label="예치금 관리로 가기" href={ROUTES.deposit} variant="primary" />
                            </div>
                        }
                    />
                </Card>
            ) : (
                <>
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
                                disabled={submitting || !account}
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
                                isDisabled={submitting || !account || balance === undefined || balance <= 0}
                                onClick={() => setAmount(balance ?? null)}
                            />
                        </div>
                        <Text type="supporting" role={amount !== null && amountError ? 'alert' : undefined}>
                            {!account
                                ? '출금 계좌를 먼저 등록해주세요.'
                                : amount === null
                                  ? '출금할 금액을 입력해주세요. 신청하면 잔액에서 바로 빠지고, 송금이 실패하면 돌아옵니다.'
                                  : (amountError ?? `${formatPrice(amount)}을 ${account.bankName} ${account.maskedAccountNumber}(으)로 출금합니다.`)}
                        </Text>
                    </Card>

                    {error ? (
                        <Card variant="red" padding={3} role="alert">
                            <Text>{error}</Text>
                        </Card>
                    ) : null}

                    <Button
                        label="출금 신청"
                        variant="primary"
                        isDisabled={wallet.isPending || !account || amountError !== null || submitting}
                        isLoading={submitting}
                        onClick={handleRequest}
                    />
                </>
            )}

            <WithdrawHistory onChanged={refreshWallet} />
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

// 응답을 받지 못했거나 서버 오류라 신청 여부를 모르는 경우
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
