'use client';

import { useEffect, useRef, useState } from 'react';
import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { walletChargeOrder } from '@/api/generated/wallet-controller/wallet-controller';
import { ApiError, errorMessage } from '@/api/http';
import { INPUT_CLASS } from '@/app/(shop)/checkout/_components/DeliveryAddressFields';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';
import { CHARGE_AMOUNT_RULE_MESSAGE, CHARGE_MIN, CHARGE_PRESETS, validateChargeAmount } from './chargeAmount';

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';

type WidgetState = 'loading' | 'ready' | 'error';

// 금액을 고르고 토스 결제위젯으로 결제한다. 결제가 끝나면 토스가 success·fail 페이지로 돌려보내고, 승인은 success 페이지가 한다.
export default function ChargeForm() {
    const [amount, setAmount] = useState<number | null>(CHARGE_MIN);
    const [widgetState, setWidgetState] = useState<WidgetState>('loading');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
    // StrictMode에서 effect가 두 번 돌아도 같은 자리에 위젯을 두 번 그리지 않게 한다
    const startedRef = useRef(false);

    const amountError = validateChargeAmount(amount);

    useEffect(() => {
        if (!CLIENT_KEY || startedRef.current) return;
        startedRef.current = true;
        (async () => {
            try {
                const tossPayments = await loadTossPayments(CLIENT_KEY);
                const widgets = tossPayments.widgets({ customerKey: ANONYMOUS });
                // 위젯은 금액을 먼저 정해야 그릴 수 있다
                await widgets.setAmount({ currency: 'KRW', value: CHARGE_MIN });
                await Promise.all([
                    widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
                    widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
                ]);
                widgetsRef.current = widgets;
                setWidgetState('ready');
            } catch {
                setWidgetState('error');
            }
        })();
    }, []);

    // 위젯에 보이는 금액(할부 가능 여부 등)을 입력과 맞춘다. 규칙을 벗어난 값은 결제할 수 없으므로 반영하지 않는다.
    // 결제 중에는 충전 주문 금액과 위젯 금액이 어긋나지 않도록 바꾸지 않는다.
    useEffect(() => {
        if (widgetState !== 'ready' || submitting || amount === null || amountError) return;
        widgetsRef.current?.setAmount({ currency: 'KRW', value: amount }).catch(() => undefined);
    }, [amount, amountError, widgetState, submitting]);

    async function handlePay() {
        const widgets = widgetsRef.current;
        if (!widgets || amount === null || amountError) return;
        setSubmitting(true);
        setError(null);
        try {
            await widgets.setAmount({ currency: 'KRW', value: amount });
            // 결제를 누를 때마다 새 충전 주문을 만든다. 같은 시도의 재전송만 같은 주문으로 묶인다.
            const order = await walletChargeOrder({ amount, idempotencyKey: crypto.randomUUID() });
            const orderNumber = order.data?.orderNumber;
            if (!orderNumber) throw new Error('충전 주문을 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
            await widgets.requestPayment({
                orderId: orderNumber,
                orderName: '예치금 충전',
                successUrl: window.location.origin + ROUTES.depositChargeSuccess,
                failUrl: window.location.origin + ROUTES.depositChargeFail,
            });
        } catch (e) {
            setError(chargeOrderErrorMessage(e));
        } finally {
            setSubmitting(false);
        }
    }

    if (!CLIENT_KEY) {
        return (
            <Card variant="red" padding={4} role="alert">
                <Text>충전 설정이 되어 있지 않습니다. 관리자에게 문의해주세요.</Text>
            </Card>
        );
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <Card padding={5} className="flex flex-col gap-4">
                <label htmlFor="charge-amount" className="font-label-md text-label-md text-on-surface">충전 금액</label>
                <div className="flex flex-wrap gap-2">
                    {CHARGE_PRESETS.map((preset) => (
                        <Button
                            key={preset}
                            label={formatPrice(preset)}
                            size="sm"
                            variant={amount === preset ? 'primary' : 'secondary'}
                            isDisabled={submitting}
                            onClick={() => setAmount(preset)}
                        />
                    ))}
                </div>
                <input
                    id="charge-amount"
                    className={INPUT_CLASS}
                    inputMode="numeric"
                    disabled={submitting}
                    value={amount === null ? '' : amount.toLocaleString('ko-KR')}
                    onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        setAmount(digits ? Number(digits) : null);
                    }}
                />
                <Text type="supporting" role={amountError ? 'alert' : undefined}>
                    {amountError ?? `${formatPrice(amount!)}을 충전합니다.`}
                </Text>
            </Card>

            <Card padding={5}>
                {widgetState === 'error' ? (
                    <Text role="alert">결제 화면을 불러오지 못했습니다. 새로고침한 뒤 다시 시도해주세요.</Text>
                ) : null}
                <div id="payment-method" />
                <div id="agreement" />
            </Card>

            {error ? (
                <Card variant="red" padding={3} role="alert">
                    <Text>{error}</Text>
                </Card>
            ) : null}

            <Button
                label="결제하기"
                variant="primary"
                isDisabled={widgetState !== 'ready' || amountError !== null || submitting}
                isLoading={submitting}
                onClick={handlePay}
            />
        </div>
    );
}

// 충전 주문 생성 오류는 BE 메시지를, 결제창 오류(구매자가 창을 닫음 등)는 토스 메시지를 보여 준다.
function chargeOrderErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.resultCode?.endsWith('WALLET_CHARGE_AMOUNT_OUT_OF_RANGE')) return CHARGE_AMOUNT_RULE_MESSAGE;
        return errorMessage(error, '충전 주문을 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    if (error instanceof Error && error.message) return error.message;
    return '결제를 진행하지 못했습니다. 잠시 후 다시 시도해주세요.';
}
