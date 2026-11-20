'use client';

import { useState } from 'react';
import { Banner, Button, CheckboxInput, Dialog, DialogHeader, RadioList, RadioListItem, Text } from '@astryxdesign/core';
import { cancelDelivery } from '@/api/generated/delivery-controller/delivery-controller';
import type { SellerDeliveryResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { DELIVERY_CANCEL_REASON_LABEL, SELLER_CANCEL_REASONS, type SellerCancelReason } from '@/lib/cancelReason';

type Outcome = { delivery: SellerDeliveryResponse; ok: true } | { delivery: SellerDeliveryResponse; ok: false; message: string };

type Props = {
    deliveries: SellerDeliveryResponse[];
    onClose: () => void;
    // 요청을 보낸 뒤 호출한다. 실패한 배송 id를 넘겨 목록에서 선택된 채로 남긴다.
    onSettled: (failedIds: number[]) => void;
};

function orderLabel(delivery: SellerDeliveryResponse): string {
    return delivery.orderNumber ?? `#${delivery.orderId ?? '-'}`;
}

// 아직 취소되지 않은 배송 상품. 이미 취소된 상품은 다시 고를 수 없다.
function remainingItems(delivery: SellerDeliveryResponse) {
    return (delivery.items ?? []).filter((item) => !item.canceledAt && item.deliveryItemId !== undefined);
}

function itemsSummary(delivery: SellerDeliveryResponse): string {
    const items = remainingItems(delivery);
    if (items.length === 0) return '상품 정보 없음';
    const first = `${items[0].productName ?? '상품'} ×${items[0].quantity ?? 0}`;
    return items.length > 1 ? `${first} 외 ${items.length - 1}건` : first;
}

function invoice(delivery: SellerDeliveryResponse): string {
    return [delivery.carrier, delivery.trackingNumber].filter(Boolean).join(' ');
}

function isSellerCancelReason(value: string): value is SellerCancelReason {
    return (SELLER_CANCEL_REASONS as readonly string[]).includes(value);
}

// 판매자 사유 취소 확인 창. 한 건이든 여러 건이든 사유는 하나만 고른다.
// 한 건이면 그 배송의 남은 상품 중 취소할 것을 고른다(처음에는 아무것도 고르지 않는다). 전부 고르면 배송이 취소된다.
// 여러 건(목록의 선택 취소)은 배송마다 남은 상품 전부를 취소한다.
// 여러 건은 한 건씩 따로 요청하고, 일부가 실패해도 나머지는 계속 처리한 뒤 결과를 보여 준다.
// (BE가 배송마다 분산락을 잡고, 같은 사유로 다시 요청하면 아무것도 바꾸지 않아 동시에 보내도 안전하다)
export default function CancelDeliveryDialog({ deliveries, onClose, onSettled }: Props) {
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState(false);
    const [running, setRunning] = useState(false);
    const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

    const single = deliveries.length === 1 ? deliveries[0] : null;
    const singleItems = single ? remainingItems(single) : [];
    const [pickedItemIds, setPickedItemIds] = useState<number[]>([]);
    const [itemsError, setItemsError] = useState(false);
    const allPicked = singleItems.length > 0 && pickedItemIds.length === singleItems.length;
    // 송장 안내는 배송이 통째로 취소될 때만 필요하다. 일부 상품만 빼면 그 송장으로 나머지를 보낸다.
    const preparing = deliveries.filter((delivery) => delivery.status === 'PREPARING' && (!single || allPicked));

    function togglePick(id: number) {
        setItemsError(false);
        setPickedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }

    function togglePickAll() {
        setItemsError(false);
        setPickedItemIds(allPicked ? [] : singleItems.map((item) => item.deliveryItemId!));
    }

    function itemIdsFor(delivery: SellerDeliveryResponse): number[] {
        return single ? pickedItemIds : remainingItems(delivery).map((item) => item.deliveryItemId!);
    }

    function close() {
        if (!running) onClose();
    }

    async function submit() {
        const missingItems = !!single && pickedItemIds.length === 0;
        if (missingItems) setItemsError(true);
        if (!isSellerCancelReason(reason)) setReasonError(true);
        if (missingItems || !isSellerCancelReason(reason)) return;
        setRunning(true);
        const results = await Promise.allSettled(deliveries.map((delivery) => cancelDelivery(delivery.deliveryId!, { cancelReason: reason, deliveryItemIds: itemIdsFor(delivery) })));
        const next: Outcome[] = results.map((result, index) =>
            result.status === 'fulfilled'
                ? { delivery: deliveries[index], ok: true }
                : { delivery: deliveries[index], ok: false, message: errorMessage(result.reason, '취소하지 못했습니다.') },
        );
        setRunning(false);
        onSettled(next.filter((outcome) => !outcome.ok).map((outcome) => outcome.delivery.deliveryId!));
        // 한 건을 문제없이 취소했으면 결과 창 없이 닫는다. 목록에서 그 행이 빠지거나(전부 취소) 상품에 취소 표시가 붙는다.
        if (single && next[0].ok) {
            onClose();
            return;
        }
        setOutcomes(next);
    }

    return (
        <Dialog isOpen onOpenChange={(open) => !open && close()} purpose="form" width={480}>
            {outcomes ? (
                <CancelResult outcomes={outcomes} onClose={onClose} />
            ) : (
                <>
                    <DialogHeader
                        title={single ? '취소할 상품을 고르세요' : `배송 ${deliveries.length}건을 취소할까요?`}
                        subtitle={single ? `주문 ${orderLabel(single)} · 받는 분 ${single.receiverName ?? '-'}` : undefined}
                        onOpenChange={(open) => !open && close()}
                    />
                    <div className="flex flex-col gap-space-md p-space-lg">
                        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-1">
                            <Text type="supporting">{single ? '상품을 전부 고르면 배송이 취소됩니다' : '선택한 배송마다 남은 상품 전부가 취소됩니다'}</Text>
                            {single ? (
                                <div className="flex flex-col gap-1">
                                    <CheckboxInput
                                        label="전체 선택"
                                        size="sm"
                                        isDisabled={running}
                                        value={allPicked ? true : pickedItemIds.length > 0 ? 'indeterminate' : false}
                                        onChange={togglePickAll}
                                    />
                                    <ul className="flex flex-col gap-1">
                                        {singleItems.map((item) => (
                                            <li key={item.deliveryItemId} className="flex items-center justify-between gap-space-sm">
                                                <CheckboxInput
                                                    label={item.productName ?? '상품 정보 없음'}
                                                    size="sm"
                                                    isDisabled={running}
                                                    value={pickedItemIds.includes(item.deliveryItemId!)}
                                                    onChange={() => togglePick(item.deliveryItemId!)}
                                                />
                                                <Text type="supporting">{item.quantity}개</Text>
                                            </li>
                                        ))}
                                    </ul>
                                    {itemsError && (
                                        <Text type="supporting" color="inherit">
                                            <span className="text-error" role="alert">
                                                취소할 상품을 골라 주세요.
                                            </span>
                                        </Text>
                                    )}
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                                    {deliveries.map((delivery) => (
                                        <li key={delivery.deliveryId} className="flex justify-between gap-space-sm">
                                            <Text weight="medium">{orderLabel(delivery)}</Text>
                                            <Text type="supporting" maxLines={1}>
                                                {itemsSummary(delivery)}
                                            </Text>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <RadioList
                            label="취소 사유"
                            value={reason}
                            isRequired
                            isDisabled={running}
                            status={reasonError ? { type: 'error', message: '취소 사유를 골라 주세요.' } : undefined}
                            onChange={(value) => {
                                setReason(value);
                                setReasonError(false);
                            }}
                        >
                            {SELLER_CANCEL_REASONS.map((value) => (
                                <RadioListItem key={value} value={value} label={DELIVERY_CANCEL_REASON_LABEL[value]} />
                            ))}
                        </RadioList>

                        {preparing.length > 0 && (
                            <Banner
                                status="info"
                                collapsible={false}
                                title={single ? `송장 ${invoice(single)}이(가) 등록되어 있습니다` : `${preparing.length}건은 송장이 등록되어 있습니다`}
                                description="택배사 예약과 송장 취소는 택배사에서 직접 해 주세요."
                            />
                        )}

                        <Banner status="warning" collapsible={false} title="취소하면 되돌릴 수 없고 사유도 바꿀 수 없습니다" description="구매자에게 결제 금액이 자동으로 환불됩니다." />

                        <div className="flex justify-end gap-space-sm">
                            <Button label="닫기" isDisabled={running} onClick={close} />
                            <Button
                                label={single ? (allPicked ? '배송 취소' : `상품 ${pickedItemIds.length}개 취소`) : `${deliveries.length}건 취소`}
                                variant="destructive"
                                isLoading={running}
                                onClick={() => void submit()}
                            />
                        </div>
                    </div>
                </>
            )}
        </Dialog>
    );
}

// 일괄 취소(또는 한 건 실패) 뒤의 결과. 성공한 배송준비 건은 택배사에서 직접 취소할 송장 목록으로 따로 보여 준다.
function CancelResult({ outcomes, onClose }: { outcomes: Outcome[]; onClose: () => void }) {
    const succeeded = outcomes.filter((outcome) => outcome.ok);
    const failed = outcomes.filter((outcome): outcome is Extract<Outcome, { ok: false }> => !outcome.ok);
    const invoices = succeeded.filter((outcome) => outcome.delivery.status === 'PREPARING' && invoice(outcome.delivery));

    return (
        <>
            <DialogHeader
                title={failed.length === 0 ? `${succeeded.length}건을 모두 취소했습니다` : `${outcomes.length}건 중 ${succeeded.length}건을 취소했습니다`}
                onOpenChange={(open) => !open && onClose()}
            />
            <div className="flex flex-col gap-space-md p-space-lg">
                {succeeded.length > 0 && (
                    <div className="flex gap-space-sm">
                        <Icon name="check_circle" className="text-[20px] text-primary shrink-0" />
                        <div className="flex flex-col">
                            <Text>{succeeded.map((outcome) => orderLabel(outcome.delivery)).join(', ')}</Text>
                            <Text type="supporting">취소했습니다. 구매자에게 자동으로 환불됩니다.</Text>
                        </div>
                    </div>
                )}

                {invoices.length > 0 && (
                    <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-1">
                        <Text weight="medium">택배사에서 직접 취소할 송장</Text>
                        <ul className="flex flex-col gap-1">
                            {invoices.map((outcome) => (
                                <li key={outcome.delivery.deliveryId} className="flex justify-between gap-space-sm">
                                    <Text type="supporting">{orderLabel(outcome.delivery)}</Text>
                                    <Text>{invoice(outcome.delivery)}</Text>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {failed.length > 0 && (
                    <ul className="flex flex-col gap-space-sm">
                        {failed.map((outcome) => (
                            <li key={outcome.delivery.deliveryId} className="flex gap-space-sm">
                                <Icon name="error" className="text-[20px] text-error shrink-0" />
                                <div className="flex flex-col">
                                    <Text>{orderLabel(outcome.delivery)} 취소 실패</Text>
                                    <Text type="supporting">{outcome.message}</Text>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <Text type="supporting">목록을 새로 불러왔습니다.{failed.length > 0 && ' 실패한 건은 선택된 채로 남겨 두었습니다.'}</Text>

                <div className="flex justify-end">
                    <Button label="확인" variant="primary" onClick={onClose} />
                </div>
            </div>
        </>
    );
}
