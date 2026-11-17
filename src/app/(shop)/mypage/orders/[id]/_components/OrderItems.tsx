'use client';

import { useState } from 'react';
import { Badge, Banner, Button, CheckboxInput, Dialog, DialogHeader, Heading, Text } from '@astryxdesign/core';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { getGetDeliveryDetailsQueryOptions } from '@/api/generated/delivery-controller/delivery-controller';
import type { OrderDetailItemResponse, OrderDetailResponse, RsDataOrderDetailResponse } from '@/api/generated/model';
import { getGetDetailQueryKey, getGetMyListQueryKey, useCancel, useCancelPreview } from '@/api/generated/order-controller/order-controller';
import { errorMessage } from '@/api/http';
import { buyerCancelLabel } from '@/lib/cancelReason';
import { formatDateTime } from '@/lib/format';
import { formatPrice } from '@/lib/salesPost';
import { cancelRejectMessage } from '../../_lib/orderView';
import { useOrderDeliveries } from './OrderDeliveries';

const CARD = 'bg-surface-container-lowest border border-outline-variant rounded p-space-md';

// 판매자가 배송을 확인한 뒤의 단계. 이 단계의 배송에 든 상품은 구매자가 취소할 수 없다(BE가 거절한다).
const BLOCKED_ITEM_NOTE: Record<string, string> = {
    PREPARING: '배송 준비 중이라 취소할 수 없습니다',
    SHIPPING: '발송된 상품이라 취소할 수 없습니다',
    DELIVERED: '배송 완료된 상품이라 취소할 수 없습니다. 교환 · 환불은 배송 조회에서 신청해 주세요',
    CONFIRMED: '구매 확정된 상품입니다',
};

function itemAmount(item: OrderDetailItemResponse): number {
    return item.amount ?? (item.unitPrice ?? 0) * (item.quantity ?? 0);
}

// 주문 항목 → 그 항목이 든 배송의 상태. 배송 카드와 같은 배송 상세 쿼리를 써서 요청은 배송마다 한 번이다.
function useItemDeliveryStatus(order: OrderDetailResponse, orderId: number): { statusOf: (itemId: number | undefined) => string | undefined; isLoading: boolean } {
    const active = !!order.paidAt && order.status !== 'CANCELED';
    const deliveries = useOrderDeliveries(orderId, active);
    const ids = (deliveries.data?.data ?? []).flatMap((delivery) => (delivery.deliveryId === undefined ? [] : [delivery.deliveryId]));
    const details = useQueries({ queries: ids.map((id) => getGetDeliveryDetailsQueryOptions(id)) });
    const byItem = new Map<number, string | undefined>();
    for (const detail of details) {
        const delivery = detail.data?.data;
        for (const item of delivery?.items ?? []) {
            if (item.orderItemId !== undefined) byItem.set(item.orderItemId, delivery?.status);
        }
    }
    return {
        statusOf: (itemId) => (itemId === undefined ? undefined : byItem.get(itemId)),
        isLoading: active && (deliveries.isPending || details.some((detail) => detail.isPending)),
    };
}

// 주문 상품 목록. 결제 완료 주문이면 취소할 수 있는 상품을 골라 취소한다(ADR 0011: 상품 단위 취소).
// 주문 전체 취소는 "전체 선택" 뒤 같은 버튼으로 한다. 처음에는 아무것도 고르지 않는다(조회 화면에서 잘못 눌러 전체가 취소되지 않게).
// 결과는 상품마다 처리 중 · 취소 · 거절로 보여 준다. 여러 판매자 상품을 함께 고르면 판매자별로 따로 판정돼 일부만 취소될 수 있다.
export default function OrderItems({ order, orderId }: { order: OrderDetailResponse; orderId: number }) {
    const items = order.items ?? [];
    const paid = order.status === 'PAID';
    const { statusOf, isLoading } = useItemDeliveryStatus(order, orderId);
    // 배송이 아직 없으면(결제 직후) 배송 생성 전 취소로 BE가 처리한다.
    const cancelable = (item: OrderDetailItemResponse) => {
        if (!paid || item.canceledAt || item.cancelInProgress || item.itemId === undefined || isLoading) return false;
        const status = statusOf(item.itemId);
        return status === undefined || status === 'REQUESTED';
    };
    const cancelableItems = items.filter(cancelable);
    const [picked, setPicked] = useState<number[]>([]);
    // 상태가 바뀌어 더는 취소할 수 없게 된 상품은 고른 목록에서 뺀다.
    const pickedIds = picked.filter((id) => cancelableItems.some((item) => item.itemId === id));
    const allPicked = cancelableItems.length > 0 && pickedIds.length === cancelableItems.length;
    const [confirming, setConfirming] = useState(false);

    function toggle(id: number) {
        setPicked(pickedIds.includes(id) ? pickedIds.filter((x) => x !== id) : [...pickedIds, id]);
    }

    return (
        <section className={CARD} aria-label="주문 상품">
            <div className="flex flex-wrap items-center justify-between gap-space-sm mb-space-md">
                <Heading level={2}>주문 상품 {items.length}건</Heading>
                {cancelableItems.length > 0 && (
                    <div className="flex items-center gap-space-sm">
                        <CheckboxInput
                            label="전체 선택"
                            size="sm"
                            value={allPicked ? true : pickedIds.length > 0 ? 'indeterminate' : false}
                            onChange={() => setPicked(allPicked ? [] : cancelableItems.map((item) => item.itemId!))}
                        />
                        <Button label={`선택 상품 취소(${pickedIds.length}개)`} size="sm" isDisabled={pickedIds.length === 0} onClick={() => setConfirming(true)} />
                    </div>
                )}
            </div>
            {items.length === 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">상품 정보가 없습니다.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-surface-container">
                    {items.map((item) => (
                        <ItemRow
                            key={item.itemId}
                            item={item}
                            deliveryStatus={statusOf(item.itemId)}
                            selectable={cancelable(item)}
                            picked={item.itemId !== undefined && pickedIds.includes(item.itemId)}
                            showBlockedNote={paid && !isLoading}
                            onToggle={() => item.itemId !== undefined && toggle(item.itemId)}
                        />
                    ))}
                </ul>
            )}
            {confirming && (
                <CancelItemsDialog
                    order={order}
                    orderId={orderId}
                    items={items.filter((item) => item.itemId !== undefined && pickedIds.includes(item.itemId))}
                    onClose={() => setConfirming(false)}
                    onRequested={() => {
                        setConfirming(false);
                        setPicked([]);
                    }}
                />
            )}
        </section>
    );
}

type ItemRowProps = {
    item: OrderDetailItemResponse;
    deliveryStatus: string | undefined;
    selectable: boolean;
    picked: boolean;
    showBlockedNote: boolean;
    onToggle: () => void;
};

function ItemRow({ item, deliveryStatus, selectable, picked, showBlockedNote, onToggle }: ItemRowProps) {
    const canceled = !!item.canceledAt;
    const reason = buyerCancelLabel(item.cancelReason);
    const rejectMessage = !canceled && !item.cancelInProgress ? cancelRejectMessage(item.cancelRejectCode) : null;
    const blockedNote = showBlockedNote && !canceled && !item.cancelInProgress && !selectable ? BLOCKED_ITEM_NOTE[deliveryStatus ?? ''] : undefined;

    return (
        <li className="py-space-sm flex items-center justify-between gap-space-md" data-item-canceled={canceled || undefined} data-item-in-progress={item.cancelInProgress || undefined}>
            <div className="flex items-start gap-space-sm min-w-0">
                {selectable && (
                    <span className="pt-0.5">
                        <CheckboxInput label={`${item.productName ?? '상품'} 선택`} isLabelHidden size="sm" value={picked} onChange={onToggle} />
                    </span>
                )}
                <div className="min-w-0 flex flex-col">
                    <Text weight="bold" maxLines={1} color={canceled ? 'disabled' : 'primary'} hasStrikethrough={canceled}>
                        {item.productName}
                    </Text>
                    <Text type="supporting">
                        {item.optionName && `옵션: ${item.optionName} · `}
                        {formatPrice(item.unitPrice ?? 0)} × {item.quantity}개
                    </Text>
                    {canceled && (
                        <span className="mt-1">
                            <Badge label={`취소${reason ? ` · ${reason}` : ''} · ${formatDateTime(item.canceledAt)}`} variant="red" />
                        </span>
                    )}
                    {item.cancelInProgress && (
                        <span className="mt-1">
                            <Badge label="취소 처리 중" variant="warning" />
                        </span>
                    )}
                    {rejectMessage && (
                        <span className="mt-1 flex flex-col gap-0.5">
                            <span>
                                <Badge label="취소 거절" variant="orange" />
                            </span>
                            <Text type="supporting">{rejectMessage}</Text>
                        </span>
                    )}
                    {blockedNote && !rejectMessage && <Text type="supporting">{blockedNote}</Text>}
                </div>
            </div>
            <Text weight="bold" color={canceled ? 'disabled' : 'primary'} hasStrikethrough={canceled}>
                {formatPrice(itemAmount(item))}
            </Text>
        </li>
    );
}

// 고른 상품과 서버가 계산한 예상 환불 금액을 보여 주고 취소를 요청한다.
// 쿠폰 최소 금액이 깨져 환불이 마이너스가 되는 조합은 BE가 예상 금액 조회부터 거절한다(ORDER_CANCEL_COUPON_MINIMUM).
function CancelItemsDialog({
    order,
    orderId,
    items,
    onClose,
    onRequested,
}: {
    order: OrderDetailResponse;
    orderId: number;
    items: OrderDetailItemResponse[];
    onClose: () => void;
    onRequested: () => void;
}) {
    const queryClient = useQueryClient();
    const orderItemIds = items.map((item) => item.itemId!);
    const preview = useCancelPreview(orderId, { orderItemIds }, { query: { staleTime: 0, retry: false } });
    const quote = preview.data?.data;
    const remaining = (order.items ?? []).filter((item) => !item.canceledAt).length;
    const cancelsAll = orderItemIds.length === remaining;

    const cancel = useCancel({
        mutation: {
            // 결제 완료 주문의 취소는 배송 서버 판정을 거쳐 끝난다. 응답을 받으면 고른 상품을 바로 "처리 중"으로 보여 준다.
            onSuccess: () => {
                queryClient.setQueryData<RsDataOrderDetailResponse>(getGetDetailQueryKey(orderId), (prev) =>
                    prev?.data
                        ? {
                              ...prev,
                              data: {
                                  ...prev.data,
                                  items: prev.data.items?.map((item) =>
                                      item.itemId !== undefined && orderItemIds.includes(item.itemId) ? { ...item, cancelInProgress: true, cancelRejectCode: undefined } : item,
                                  ),
                              },
                          }
                        : prev,
                );
                onRequested();
            },
            onSettled: () => {
                void queryClient.invalidateQueries({ queryKey: getGetDetailQueryKey(orderId) });
                void queryClient.invalidateQueries({ queryKey: getGetMyListQueryKey() });
            },
        },
    });
    const busy = cancel.isPending;
    const close = () => !busy && onClose();

    return (
        <Dialog isOpen onOpenChange={(open) => !open && close()} purpose="form" width={480}>
            <DialogHeader title={cancelsAll ? '주문 전체를 취소할까요?' : `상품 ${items.length}개를 취소할까요?`} subtitle={`주문 ${order.orderNumber}`} onOpenChange={(open) => !open && close()} />
            <div className="flex flex-col gap-space-md p-space-lg">
                <ul className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-1">
                    {items.map((item) => (
                        <li key={item.itemId} className="flex justify-between gap-space-sm">
                            <Text maxLines={1}>
                                {item.productName}
                                {item.optionName ? ` (${item.optionName})` : ''} × {item.quantity}
                            </Text>
                            <Text type="supporting">{formatPrice(itemAmount(item))}</Text>
                        </li>
                    ))}
                </ul>

                {preview.isPending ? (
                    <Text type="supporting">예상 환불 금액을 계산하고 있습니다…</Text>
                ) : preview.isError ? (
                    <Banner status="error" collapsible={false} title="이 상품만은 취소할 수 없습니다" description={errorMessage(preview.error, '예상 환불 금액을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')} />
                ) : (
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                            <Text weight="bold">예상 환불 금액</Text>
                            <Text weight="bold" color="accent">
                                {formatPrice(quote?.refundAmount ?? 0)}
                            </Text>
                        </div>
                        {(quote?.refundAmount ?? 0) < items.reduce((sum, item) => sum + itemAmount(item), 0) && (
                            <Text type="supporting">쿠폰 할인이 남은 상품 기준으로 다시 계산되어, 상품 금액보다 적게 환불될 수 있습니다.</Text>
                        )}
                        {quote?.couponReturned && <Text type="supporting">사용한 쿠폰이 반환됩니다.</Text>}
                    </div>
                )}

                <Banner
                    status="info"
                    collapsible={false}
                    title="판매자가 배송 준비를 시작하기 전까지만 취소됩니다"
                    description="판매자 확인 결과에 따라 상품마다 취소되거나 거절됩니다. 취소된 상품의 금액은 예치금으로 환불됩니다."
                />

                {cancel.isError && <Banner status="error" collapsible={false} title="취소를 요청하지 못했습니다" description={errorMessage(cancel.error, '잠시 후 다시 시도해 주세요.')} />}

                <div className="flex justify-end gap-space-sm">
                    <Button label="닫기" isDisabled={busy} onClick={close} />
                    <Button
                        label={cancelsAll ? '주문 전체 취소' : `상품 ${items.length}개 취소`}
                        variant="destructive"
                        isLoading={busy}
                        isDisabled={!quote}
                        onClick={() => cancel.mutate({ id: orderId, data: { orderItemIds } })}
                    />
                </div>
            </div>
        </Dialog>
    );
}
