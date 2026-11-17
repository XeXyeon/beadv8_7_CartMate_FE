'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Heading, type BadgeVariant } from '@astryxdesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardQueryKey } from '@/api/generated/individual-group-purchase-controller/individual-group-purchase-controller';
import type { OrderDetailResponse, RsDataOrderDetailResponse } from '@/api/generated/model';
import { getGetDetailQueryKey, getGetMyListQueryKey, useCancel, useGetDetail } from '@/api/generated/order-controller/order-controller';
import { getPreviewQueryKey } from '@/api/generated/order-controller/order-controller';
import { getGetDeliveriesByOrderQueryKey } from '@/api/generated/delivery-controller/delivery-controller';
import { getGetByOrderQueryKey, useGetByOrder } from '@/api/generated/payment-controller/payment-controller';
import { getGetMyWalletQueryKey } from '@/api/generated/wallet-controller/wallet-controller';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { ORDER_CANCEL_MESSAGE, partialCancelTitle } from '@/lib/cancelReason';
import { formatDateTime, parseKst } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';
import { errorStatus, hasCode, KIND_LABEL, ORDER_STATUS } from '../../_lib/orderView';
import OrderDeliveries, { summarizeDeliveries, useOrderDeliveries } from './OrderDeliveries';
import OrderItems from './OrderItems';

const CARD = 'bg-surface-container-lowest border border-outline-variant rounded p-space-md';
const CARD_TITLE = 'font-label-md text-label-md text-on-surface font-bold mb-space-md';
const OUTLINE_BUTTON =
    'h-10 px-space-md border border-outline-variant bg-surface-container-lowest hover:bg-surface-container font-label-md text-label-md text-on-surface rounded inline-flex items-center justify-center gap-space-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-container-lowest';
const TONE_VARIANT: Record<'pending' | 'done' | 'muted', BadgeVariant> = { pending: 'warning', done: 'success', muted: 'neutral' };
// 취소 요청 · 환불 처리를 기다리는 동안 다시 받는 간격
const CANCEL_POLL_MS = 3000;

// 개인 주문(일반 · 개인물품 공구) 상세. 공동물품 공구 주문은 목록에서 공동구매 결과 화면으로 바로 보낸다.
export default function OrderDetailView() {
    const params = useParams<{ id: string }>();
    const orderId = Number(params.id);
    const validId = Number.isInteger(orderId) && orderId > 0;
    const query = useGetDetail(orderId, {
        query: {
            enabled: validId,
            retry: (count, error) => errorStatus(error) === undefined && count < 2,
            // 결제 완료 주문의 상품 취소는 배송 서버 판정을 거쳐 비동기로 끝난다. 처리 중인 상품이 있으면 결과가 날 때까지 다시 받는다.
            refetchInterval: (q) => (q.state.data?.data?.items?.some((item) => item.cancelInProgress) ? CANCEL_POLL_MS : false),
        },
    });
    const order = query.data?.data;

    if (!validId) return <DetailNotice icon="search_off" title="주문을 찾을 수 없습니다" message="주소가 올바른지 확인해주세요." />;
    if (query.isPending) return <OrderDetailSkeleton />;
    if (!order) {
        const status = errorStatus(query.error);
        if (status === 404) return <DetailNotice icon="search_off" title="주문을 찾을 수 없습니다" message="삭제되었거나 존재하지 않는 주문입니다." />;
        if (status === 403) return <DetailNotice icon="lock" title="볼 수 없는 주문입니다" message="본인이 주문한 내역만 볼 수 있습니다." />;
        return (
            <DetailNotice icon="error" title="주문 정보를 불러오지 못했습니다" message={errorMessage(query.error, '잠시 후 다시 시도해주세요.')}>
                <Button label="다시 시도" variant="secondary" onClick={() => void query.refetch()} />
            </DetailNotice>
        );
    }

    return <OrderDetail order={order} orderId={orderId} />;
}

function OrderDetail({ order, orderId }: { order: OrderDetailResponse; orderId: number }) {
    const status = ORDER_STATUS[order.status ?? ''] ?? { label: order.status ?? '-', tone: 'muted' as const };
    const kind = order.orderType === 'INDIVIDUAL_GROUP' ? 'INDIVIDUAL_GROUP' : 'PERSONAL';
    const items = order.items ?? [];
    const itemsTotal = items.reduce((sum, item) => sum + (item.amount ?? (item.unitPrice ?? 0) * (item.quantity ?? 0)), 0);
    // 판매글 내림·판매자 사유 취소로 일부 상품만 취소된 주문. 주문 상태는 결제 완료 그대로라 항목을 보고 판단한다.
    const canceledItems = items.filter((item) => item.canceledAt);
    const partiallyCanceled = order.status === 'PAID' && canceledItems.length > 0;
    useRefreshOnCancelChange(order, orderId);

    return (
        <div className="flex flex-col gap-space-lg">
            {/* 주문 머리 + 진행 단계 */}
            <Card padding={4} className="flex flex-col gap-space-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
                    <div className="flex flex-wrap items-center gap-space-sm">
                        <Heading level={1}>주문 {order.orderNumber}</Heading>
                        <Badge label={KIND_LABEL[kind]} variant={kind === 'INDIVIDUAL_GROUP' ? 'purple' : 'neutral'} />
                        <Badge label={status.label} variant={TONE_VARIANT[status.tone]} />
                        {partiallyCanceled && <Badge label="일부 취소" variant="warning" />}
                    </div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">주문일시 {formatDateTime(order.createdAt)}</div>
                </div>
                <OrderSteps order={order} orderId={orderId} />
            </Card>

            <OrderStatusPanel order={order} orderId={orderId} canceledReasons={partiallyCanceled ? canceledItems.map((item) => item.cancelReason) : []} />

            {/* 결제가 끝난 주문만 배송이 생긴다 */}
            {order.paidAt && <OrderDeliveries orderId={orderId} />}

            {/* 주문 상품 (결제 완료 주문은 여기서 상품을 골라 취소한다) */}
            <OrderItems order={order} orderId={orderId} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                {/* 배송지 */}
                <section className={CARD} aria-label="배송지 정보">
                    <h2 className={CARD_TITLE}>배송지 정보</h2>
                    {order.deliveryAddress ? (
                        <dl className="grid grid-cols-[88px_1fr] gap-y-space-xs font-body-sm text-body-sm">
                            <dt className="text-outline">받는 분</dt>
                            <dd className="text-on-surface font-bold">{order.deliveryAddress.receiverName}</dd>
                            <dt className="text-outline">연락처</dt>
                            <dd className="text-on-surface">{order.deliveryAddress.receiverPhone}</dd>
                            <dt className="text-outline">주소</dt>
                            <dd className="text-on-surface">
                                {order.deliveryAddress.zipCode && `[${order.deliveryAddress.zipCode}] `}
                                {order.deliveryAddress.address} {order.deliveryAddress.addressDetail}
                            </dd>
                        </dl>
                    ) : (
                        <p className="font-body-sm text-body-sm text-on-surface-variant">배송지 정보가 없습니다.</p>
                    )}
                </section>

                {/* 결제 정보 */}
                <section className={CARD} aria-label="결제 정보">
                    <h2 className={CARD_TITLE}>결제 정보</h2>
                    <dl className="grid grid-cols-[1fr_auto] gap-y-space-xs font-body-sm text-body-sm">
                        <dt className="text-outline">상품 금액</dt>
                        <dd className="text-on-surface text-right">{formatPrice(itemsTotal)}</dd>
                        <dt className="text-outline">결제 수단</dt>
                        <dd className="text-on-surface text-right">{order.paidAt ? '팀바이 예치금' : '-'}</dd>
                        <dt className="text-outline">결제 일시</dt>
                        <dd className="text-on-surface text-right">{order.paidAt ? formatDateTime(order.paidAt) : '-'}</dd>
                        <dt className="pt-space-xs mt-space-xs border-t border-surface-container font-headline-sm text-headline-sm text-primary font-bold">
                            {order.paidAt ? '결제 금액' : '주문 금액'}
                        </dt>
                        <dd className="pt-space-xs mt-space-xs border-t border-surface-container font-headline-sm text-headline-sm text-primary font-bold text-right">
                            {formatPrice(order.totalAmount ?? 0)}
                        </dd>
                        {order.paidAt && (canceledItems.length > 0 || order.status === 'CANCELED') && <RefundRow orderId={orderId} />}
                    </dl>
                </section>
            </div>

            <div className="flex flex-col sm:flex-row gap-space-sm">
                <Button label="주문 목록으로" variant="secondary" className="flex-1" href={ROUTES.orders} icon={<Icon name="list" className="text-[18px]" />} />
                {kind === 'INDIVIDUAL_GROUP' && order.individualGroupPurchaseId !== undefined && (
                    <Button label="개인물품 공구 보기" variant="secondary" className="flex-1" href={ROUTES.groupPurchaseIndividual(order.individualGroupPurchaseId)} icon={<Icon name="groups" className="text-[18px]" />} />
                )}
            </div>
        </div>
    );
}

// 실제로 돌려준 금액은 결제 서버가 안다. 주문 서버가 계산한 금액과 다를 수 있어 결제 내역에서 읽는다.
// 취소 이벤트가 아직 처리되지 않았으면 0이라 "환불 진행 중"으로 보여 준다.
function RefundRow({ orderId }: { orderId: number }) {
    const payment = useGetByOrder(orderId, {
        query: { refetchInterval: (q) => ((q.state.data?.data?.refundedAmount ?? 0) > 0 ? false : CANCEL_POLL_MS) },
    });
    const refunded = payment.data?.data?.refundedAmount ?? 0;
    // 환불이 반영되면 헤더 · 예치금 화면의 잔액도 새로 받는다.
    const queryClient = useQueryClient();
    useEffect(() => {
        if (refunded > 0) void queryClient.invalidateQueries({ queryKey: getGetMyWalletQueryKey() });
    }, [refunded, queryClient]);
    const text = payment.isPending ? '확인 중' : payment.isError ? '예치금 내역에서 확인' : refunded > 0 ? `-${formatPrice(refunded)}` : '환불 진행 중';
    return (
        <>
            <dt className="text-outline">환불 금액</dt>
            <dd className={`text-right font-bold ${refunded > 0 ? 'text-primary' : 'text-on-surface-variant'}`} data-refunded-amount={refunded}>
                {text}
            </dd>
        </>
    );
}

// 주문 상태나 상품 취소 상황이 바뀌면 같은 화면의 배송 · 결제 정보도 새로 받는다.
// (상품 취소가 확정되면 배송 상품이 취소 표시되거나 배송이 취소되고, 환불이 생긴다)
function useRefreshOnCancelChange(order: OrderDetailResponse, orderId: number) {
    const queryClient = useQueryClient();
    const items = order.items ?? [];
    const signature = `${order.status}:${items.filter((item) => item.canceledAt).length}:${items.filter((item) => item.cancelInProgress).length}`;
    const previous = useRef(signature);
    useEffect(() => {
        if (previous.current === signature) return;
        previous.current = signature;
        void queryClient.invalidateQueries({ queryKey: getGetDeliveriesByOrderQueryKey({ orderId, purchaseType: 'INDIVIDUAL_GROUP' }) });
        // 배송 카드마다 배송 상세(/api/deliveries/{id})를 따로 받는다.
        void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('/api/deliveries/') });
        void queryClient.invalidateQueries({ queryKey: getGetByOrderQueryKey(orderId) });
        void queryClient.invalidateQueries({ queryKey: getGetMyListQueryKey() });
    }, [signature, orderId, queryClient]);
}

type StepState = 'done' | 'current' | 'todo' | 'canceled';

const STEP_CIRCLE: Record<StepState, string> = {
    done: 'bg-primary text-on-primary',
    current: 'bg-surface-container-lowest border-2 border-primary text-primary',
    todo: 'bg-surface-container border border-outline-variant text-outline',
    canceled: 'bg-surface-container border border-outline text-outline',
};

// 주문 접수 → 결제 → 배송 · 구매 확정. 마지막 칸은 배송 상태 요약이고, 자세한 단계는 아래 배송 조회 카드에 있다.
function OrderSteps({ order, orderId }: { order: OrderDetailResponse; orderId: number }) {
    const canceled = order.status === 'CANCELED';
    const paid = !!order.paidAt;
    // 배송 조회 영역과 같은 쿼리라 요청은 한 번만 나간다.
    const deliveries = useOrderDeliveries(orderId, paid && !canceled);
    const summary = summarizeDeliveries(deliveries.data?.data);
    const steps: { label: string; note: string; state: StepState }[] = [
        { label: '주문 접수', note: formatDateTime(order.createdAt), state: 'done' },
        canceled && !paid
            ? { label: '주문 취소', note: formatDateTime(order.canceledAt), state: 'canceled' }
            : { label: '결제 완료', note: paid ? formatDateTime(order.paidAt) : '결제 대기 중', state: paid ? 'done' : 'current' },
        canceled && paid
            ? { label: '주문 취소', note: formatDateTime(order.canceledAt), state: 'canceled' }
            : summary
              ? { label: summary.done ? '구매 확정' : '배송 · 구매 확정', note: summary.label, state: summary.done ? 'done' : 'current' }
              : { label: '배송 · 구매 확정', note: paid ? '배송 정보 확인 중' : '결제 후 배송', state: 'todo' },
    ];

    return (
        <ol className="grid grid-cols-3 gap-space-sm">
            {steps.map((step, index) => (
                <li key={step.label} className="flex flex-col items-center text-center">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center font-label-md text-label-md mb-space-xs ${STEP_CIRCLE[step.state]}`}>
                        {step.state === 'canceled' ? <Icon name="close" className="text-[18px]" /> : `0${index + 1}`}
                    </span>
                    <span className={`font-label-sm text-label-sm ${step.state === 'todo' || step.state === 'canceled' ? 'text-outline' : 'text-on-surface font-bold'}`}>{step.label}</span>
                    <span className="font-caption text-caption text-outline mt-0.5">{step.note}</span>
                </li>
            ))}
        </ol>
    );
}

// 상태별 안내와 할 수 있는 일. 결제 대기 주문은 여기서 주문 전체를 바로 취소한다.
// 결제 완료 주문의 취소는 주문 상품 목록에서 상품을 골라 한다(OrderItems).
function OrderStatusPanel({ order, orderId, canceledReasons }: { order: OrderDetailResponse; orderId: number; canceledReasons: (string | undefined)[] }) {
    const queryClient = useQueryClient();
    // 결제 기한 지남 판단 기준 시각. 화면에 들어온 시점으로 고정한다(지나면 BE 스케줄러가 곧 자동 취소).
    const [now] = useState(Date.now);
    const cancel = useCancel({
        mutation: {
            // 재조회가 실패해도 "취소하는 중"에 멈추지 않도록 응답을 받자마자 화면의 상태를 취소로 바꿔 둔다.
            onSuccess: () => {
                queryClient.setQueryData<RsDataOrderDetailResponse>(getGetDetailQueryKey(orderId), (prev) =>
                    prev?.data ? { ...prev, data: { ...prev.data, status: 'CANCELED', cancelReason: 'BUYER_CANCELED' } } : prev,
                );
            },
            onSettled: () => {
                // 성공이든 409(이미 취소 · 상태 변경)든 지금 상태를 다시 받아 맞춘다.
                void queryClient.invalidateQueries({ queryKey: getGetDetailQueryKey(orderId) });
                void queryClient.invalidateQueries({ queryKey: getGetMyListQueryKey() });
                queryClient.removeQueries({ queryKey: getPreviewQueryKey(orderId) });
                // 개인물품 공구 주문이면 공구 현황판의 주문 목록도 바뀐다.
                if (order.individualGroupPurchaseId !== undefined) {
                    void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(order.individualGroupPurchaseId) });
                }
            },
        },
    });

    if (order.status === 'CANCELED') {
        return (
            <Card padding={3} className="flex items-start gap-space-sm" role="status">
                <Icon name="cancel" className="text-[22px] text-outline mt-0.5" />
                <div className="font-body-sm text-body-sm">
                    <div className="font-bold text-on-surface">취소된 주문입니다 · {formatDateTime(order.canceledAt)}</div>
                    <p className="text-on-surface-variant mt-0.5">{ORDER_CANCEL_MESSAGE[order.cancelReason ?? ''] ?? '주문이 취소되었습니다.'}</p>
                </div>
            </Card>
        );
    }

    const pending = order.status === 'PAYMENT_PENDING';
    const expired = pending && (parseKst(order.paymentDeadlineAt)?.getTime() ?? Infinity) <= now;
    const busy = cancel.isPending;
    const inProgress = (order.items ?? []).some((item) => item.cancelInProgress);

    const onCancel = () => {
        if (busy) return;
        if (!window.confirm(`주문 ${order.orderNumber}을(를) 취소할까요?\n취소한 주문은 되돌릴 수 없습니다.`)) return;
        cancel.mutate({ id: orderId });
    };

    return (
        <section className={`${CARD} flex flex-col gap-space-sm`} aria-label="주문 상태">
            {pending ? (
                <div className="flex items-start gap-space-sm font-body-sm text-body-sm">
                    <Icon name="schedule" className="text-[22px] text-primary mt-0.5" />
                    <div>
                        <div className="font-bold text-on-surface">결제를 기다리고 있습니다</div>
                        <p className="text-on-surface-variant mt-0.5">
                            {expired
                                ? '결제 기한이 지났습니다. 주문은 곧 자동으로 취소됩니다.'
                                : `${formatDateTime(order.paymentDeadlineAt)}까지 결제하지 않으면 자동으로 취소됩니다.`}
                        </p>
                    </div>
                </div>
            ) : canceledReasons.length > 0 ? (
                <div className="flex items-start gap-space-sm font-body-sm text-body-sm">
                    <Icon name="info" className="text-[22px] text-primary mt-0.5" />
                    <div>
                        <div className="font-bold text-on-surface">{partialCancelTitle(canceledReasons)}</div>
                        <p className="text-on-surface-variant mt-0.5">취소된 상품 금액은 예치금으로 환불됩니다. 나머지 상품은 그대로 배송됩니다.</p>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-space-sm font-body-sm text-body-sm">
                    <Icon name="task_alt" className="text-[22px] text-primary mt-0.5" />
                    <div>
                        <div className="font-bold text-on-surface">결제가 완료된 주문입니다</div>
                        <p className="text-on-surface-variant mt-0.5">
                            {inProgress
                                ? '취소 요청을 처리하고 있습니다. 결과는 아래 주문 상품에 상품마다 표시되고, 이 화면은 자동으로 바뀝니다.'
                                : '판매자가 배송 준비를 시작하기 전까지는 아래 주문 상품에서 상품을 골라 취소할 수 있습니다.'}
                        </p>
                    </div>
                </div>
            )}

            {cancel.isError && (
                <p className="font-body-sm text-body-sm text-error" role="alert">
                    {hasCode(cancel.error, 'ORDER_ALREADY_CANCELED')
                        ? '이미 취소된 주문입니다. 최신 상태로 다시 불러옵니다.'
                        : errorMessage(cancel.error, '주문을 취소하지 못했습니다. 잠시 후 다시 시도해주세요.')}
                </p>
            )}

            {pending && (
                <div className="flex flex-col sm:flex-row gap-space-sm">
                    {!expired && (
                        <Button label={`${formatPrice(order.totalAmount ?? 0)} 결제하기`} variant="primary" className="flex-1" href={`${ROUTES.checkout}?order=${orderId}`} icon={<Icon name="account_balance_wallet" className="text-[18px]" />} />
                    )}
                    <button className={`${OUTLINE_BUTTON} flex-1`} type="button" disabled={busy} onClick={onCancel}>
                        {busy ? '취소하는 중...' : '주문 취소'}
                    </button>
                </div>
            )}
        </section>
    );
}

function DetailNotice({ icon, title, message, children }: { icon: string; title: string; message: string; children?: React.ReactNode }) {
    return (
        <EmptyState
            icon={<Icon name={icon} />}
            title={title}
            description={message}
            actions={<div className="flex flex-wrap justify-center gap-space-sm">{children}<Button label="주문 목록으로" variant="secondary" href={ROUTES.orders} /></div>}
        />
    );
}

export function OrderDetailSkeleton() {
    return (
        <div className="flex flex-col gap-space-lg" aria-hidden>
            <div className="h-40 rounded bg-surface-container animate-pulse" />
            <div className="h-28 rounded bg-surface-container animate-pulse" />
            <div className="h-48 rounded bg-surface-container animate-pulse" />
        </div>
    );
}
