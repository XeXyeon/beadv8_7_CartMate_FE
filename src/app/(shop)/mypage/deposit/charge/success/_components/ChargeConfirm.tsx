'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { getGetMyWalletQueryKey, walletChargeConfirm } from '@/api/generated/wallet-controller/wallet-controller';
import { ApiError, errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';

type State =
    | { kind: 'confirming' }
    | { kind: 'done'; balance?: number }
    | { kind: 'processing'; message: string }
    | { kind: 'failed'; message: string };

// 토스에서 돌아온 결제를 BE에 승인 요청한다. 새로고침으로 다시 불러도 BE가 같은 결제키의 완료 주문은 그대로 성공으로 돌려준다.
export default function ChargeConfirm() {
    const searchParams = useSearchParams();
    const paymentKey = searchParams.get('paymentKey') ?? '';
    const orderNumber = searchParams.get('orderId') ?? '';
    const amount = Number(searchParams.get('amount'));
    const valid = paymentKey !== '' && orderNumber !== '' && Number.isInteger(amount) && amount > 0;
    const [state, setState] = useState<State>(
        valid ? { kind: 'confirming' } : { kind: 'failed', message: '결제 정보가 올바르지 않습니다.' },
    );
    const queryClient = useQueryClient();
    // StrictMode에서 effect가 두 번 돌아도 승인 요청은 한 번만 보낸다
    const startedRef = useRef(false);

    useEffect(() => {
        if (!valid || startedRef.current) return;
        startedRef.current = true;
        walletChargeConfirm({ orderNumber, paymentKey, amount })
            .then((res) => {
                void queryClient.invalidateQueries({ queryKey: getGetMyWalletQueryKey() });
                setState({ kind: 'done', balance: res.data?.balance });
            })
            .catch((e: unknown) => {
                const message = chargeConfirmErrorMessage(e);
                setState(isProcessing(e) ? { kind: 'processing', message } : { kind: 'failed', message });
            });
    }, [valid, orderNumber, paymentKey, amount, queryClient]);

    if (state.kind === 'confirming') {
        return (
            <Card padding={5}>
                <EmptyState title="결제를 확인하고 있습니다" description="잠시만 기다려주세요." icon={<Icon name="hourglass_top" />} />
            </Card>
        );
    }

    if (state.kind === 'done') {
        const balanceText = state.balance === undefined ? '' : ` 사용 가능 잔액은 ${formatPrice(state.balance)}입니다.`;
        return (
            <Card padding={5}>
                <EmptyState
                    title="충전이 완료되었습니다"
                    description={`${formatPrice(amount)}을 충전했습니다.${balanceText}`}
                    icon={<Icon name="check_circle" />}
                    actions={<Button label="예치금 관리로 가기" href={ROUTES.deposit} variant="primary" />}
                />
            </Card>
        );
    }

    if (state.kind === 'processing') {
        return (
            <Card padding={5}>
                <EmptyState
                    title="결제를 확인하고 있습니다"
                    description={state.message}
                    icon={<Icon name="hourglass_top" />}
                    actions={<Button label="예치금 내역 보기" href={ROUTES.depositHistory} variant="primary" />}
                />
            </Card>
        );
    }

    return (
        <Card padding={5}>
            <EmptyState
                title="충전하지 못했습니다"
                description={state.message}
                icon={<Icon name="error" />}
                actions={<Button label="다시 충전하기" href={ROUTES.depositCharge} variant="primary" />}
            />
        </Card>
    );
}

function isProcessing(error: unknown): boolean {
    return error instanceof ApiError && !!error.resultCode?.endsWith('WALLET_CHARGE_PAYMENT_PROCESSING');
}

export function chargeConfirmErrorMessage(error: unknown): string {
    const code = error instanceof ApiError ? error.resultCode : undefined;
    if (code?.endsWith('WALLET_CHARGE_PAYMENT_PROCESSING')) {
        return '결제 승인 결과를 확인하고 있습니다. 잠시 후 예치금 내역에서 충전 여부를 확인해주세요.';
    }
    if (code?.endsWith('WALLET_CHARGE_PAYMENT_REJECTED')) {
        return '결제가 승인되지 않았습니다. 다른 결제수단으로 다시 시도해주세요.';
    }
    return errorMessage(error, '충전을 완료하지 못했습니다. 예치금 내역을 확인한 뒤 다시 시도해주세요.');
}
