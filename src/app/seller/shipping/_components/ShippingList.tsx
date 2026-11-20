'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CheckboxInput, Heading } from '@astryxdesign/core';
import { getGetSellerDeliveriesQueryKey, useGetSellerDeliveries, useReadyDelivery, useShipDelivery } from '@/api/generated/delivery-controller/delivery-controller';
import { GetSellerDeliveriesStatus } from '@/api/generated/model';
import type { SellerDeliveryResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { deliveryCancelLabel } from '@/lib/cancelReason';
import { formatDateTime, formatPhone } from '@/lib/format';
import CancelDeliveryDialog from './CancelDeliveryDialog';
import { readShippingStatus } from './ShippingStatusTabs';

const COURIERS = ['CJ대한통운', '우체국택배', '롯데택배'];

// BE 는 택배사·송장번호를 각각 50자까지 받는다.
const MAX_LENGTH = 50;


const PAGE_SIZE = 20;
// 페이지 번호는 현재 페이지 앞뒤로 이만큼만 보여 준다.
const PAGE_WINDOW = 2;

const STATUS_LABEL: Record<string, string> = {
    REQUESTED: '배송요청',
    PREPARING: '배송준비',
    SHIPPING: '배송중',
    DELIVERED: '배송완료',
    CONFIRMED: '구매확정',
    CANCELED: '배송취소',
};

// URL 의 page 는 사람이 보는 1부터, BE 요청은 0부터다.
function readPage(raw: string | null): number {
    const page = Number(raw);
    return Number.isInteger(page) && page >= 1 ? page : 1;
}

// 취소된 상품은 보내지 않으므로 수량에서 뺀다.
function totalQuantity(delivery: SellerDeliveryResponse): number {
    return (delivery.items ?? []).filter((item) => !item.canceledAt).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

// 판매자가 직접 취소할 수 있는 상태: 물건이 나가기 전(배송요청·배송준비).
function isCancelable(status: string | undefined): boolean {
    return status === GetSellerDeliveriesStatus.REQUESTED || status === GetSellerDeliveriesStatus.PREPARING;
}

type RowProps = {
    delivery: SellerDeliveryResponse;
    selectable: boolean;
    selected: boolean;
    onToggle: () => void;
    onCancel: () => void;
};

function DeliveryRow({ delivery, selectable, selected, onToggle, onCancel }: RowProps) {
    const queryClient = useQueryClient();
    const items = delivery.items ?? [];
    const address = [delivery.zipCode && `[${delivery.zipCode}]`, delivery.address, delivery.addressDetail].filter(Boolean).join(' ');
    const orderLabel = delivery.orderNumber ?? `주문 ${delivery.orderId ?? '번호 없음'}`;
    // 이미 등록된 택배사가 고정 목록에 없어도 선택값으로 보이도록 목록에 더한다.
    const courierOptions = delivery.carrier && !COURIERS.includes(delivery.carrier) ? [...COURIERS, delivery.carrier] : COURIERS;

    const [carrier, setCarrier] = useState(delivery.carrier ?? '');
    const [trackingNumber, setTrackingNumber] = useState(delivery.trackingNumber ?? '');
    const [error, setError] = useState<string | null>(null);

    // 등록·출고에 성공하면 목록을 다시 조회한다. 상태가 바뀐 배송은 현재 탭에서 빠지고 다음 상태의 탭에 나타난다.
    function onSuccess() {
        setError(null);
        void queryClient.invalidateQueries({ queryKey: getGetSellerDeliveriesQueryKey() });
    }
    const ready = useReadyDelivery({ mutation: { onSuccess, onError: (e) => setError(errorMessage(e, '송장 등록에 실패했습니다.')) } });
    const ship = useShipDelivery({ mutation: { onSuccess, onError: (e) => setError(errorMessage(e, '출고 처리에 실패했습니다.')) } });
    const busy = ready.isPending || ship.isPending;
    // 송장은 배송 요청일 때만 입력한다. BE 는 이미 등록한 송장의 수정을 지원하지 않는다.
    const editable = delivery.status === GetSellerDeliveriesStatus.REQUESTED;
    const isPreparing = delivery.status === GetSellerDeliveriesStatus.PREPARING;

    function register() {
        const nextCarrier = carrier.trim();
        const nextTracking = trackingNumber.trim();
        if (!nextCarrier || !nextTracking) {
            setError('택배사와 송장번호를 입력해 주세요.');
            return;
        }
        if (nextCarrier.length > MAX_LENGTH || nextTracking.length > MAX_LENGTH) {
            setError(`택배사와 송장번호는 ${MAX_LENGTH}자 이하로 입력해 주세요.`);
            return;
        }
        setError(null);
        ready.mutate({ deliveryId: delivery.deliveryId!, data: { carrier: nextCarrier, trackingNumber: nextTracking } });
    }

    function shipOut() {
        if (!window.confirm('출고 처리할까요? 처리 후에는 되돌릴 수 없습니다.')) return;
        setError(null);
        ship.mutate({ deliveryId: delivery.deliveryId! });
    }

    return (
        <tr className="hover:bg-surface-container-low transition-colors">
            {selectable && (
                <td className="p-space-md">
                    <CheckboxInput label={`${orderLabel} 선택`} isLabelHidden size="sm" value={selected} onChange={onToggle} />
                </td>
            )}
            <td className="p-space-md">
                {/* 공유 공동구매 배송과 이전에 만든 배송은 주문번호가 없어 주문 ID 로 대신한다. */}
                <div className="font-label-md text-primary">{delivery.orderNumber ?? `#${delivery.orderId ?? '-'}`}</div>
                <div className="text-caption text-on-surface-variant">{formatDateTime(delivery.createdAt)}</div>
            </td>
            <td className="p-space-md">
                {items.map((item) => (
                    <div key={item.deliveryItemId} className={item.canceledAt ? 'text-outline' : undefined}>
                        <div className={`font-label-md ${item.canceledAt ? 'line-through' : ''}`}>{item.productName ?? '상품 정보 없음'}</div>
                        <div className="text-caption text-on-surface-variant">{(item.options ?? []).map((option) => `${option.optionName}: ${option.optionValue}`).join(' / ')}</div>
                        {/* 상품 단위로 취소된 상품. 남은 상품만 보낸다. */}
                        {item.canceledAt && <div className="text-caption text-error">취소 · {deliveryCancelLabel(item.cancelReason) ?? '사유 기록 없음'}</div>}
                    </div>
                ))}
            </td>
            <td className="p-space-md text-center font-label-md">{totalQuantity(delivery)}</td>
            <td className="p-space-md">
                <div className="font-label-md">{delivery.receiverName}</div>
                <div className="text-caption text-on-surface-variant">
                    {delivery.receiverPhone ? formatPhone(delivery.receiverPhone) : '-'}
                    <br />
                    {address}
                </div>
            </td>
            <td className="p-space-md text-center">
                <Badge label={STATUS_LABEL[delivery.status ?? ''] ?? delivery.status} />
            </td>
            <td className="p-space-md">
                {/* 배송 요청: 송장 등록(ready) / 배송 준비: 출고(ship) / 그 이후: 비활성 */}
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <select
                            aria-label={`${orderLabel} 택배사`}
                            className="w-28 bg-surface border border-outline-variant rounded px-2 py-1 text-body-sm text-on-surface disabled:opacity-60"
                            value={carrier}
                            disabled={!editable || busy}
                            onChange={(e) => setCarrier(e.target.value)}
                        >
                            <option value="">택배사 선택</option>
                            {courierOptions.map((courier) => (
                                <option key={courier}>{courier}</option>
                            ))}
                        </select>
                        <input
                            aria-label={`${orderLabel} 송장번호`}
                            className="flex-1 bg-surface border border-outline-variant rounded px-2 py-1 text-body-sm text-on-surface disabled:opacity-60"
                            placeholder="송장번호 입력"
                            type="text"
                            value={trackingNumber}
                            disabled={!editable || busy}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                        />
                    </div>
                    {/* 배송 중·완료 등 판매자가 더 할 일이 없는 행에는 버튼을 두지 않는다. */}
                    {(editable || isPreparing) && (
                        <div className="flex justify-end gap-1">
                            <Button label="취소" variant="destructive" size="sm" isDisabled={busy} onClick={onCancel} />
                            {editable ? (
                                <Button label={ready.isPending ? '처리 중…' : '등록'} isDisabled={busy} onClick={register} />
                            ) : (
                                <Button label={ship.isPending ? '처리 중…' : '출고'} isDisabled={busy} onClick={shipOut} />
                            )}
                        </div>
                    )}
                    {error && (
                        <p className="text-caption text-error text-right" role="alert">
                            {error}
                        </p>
                    )}
                </div>
            </td>
        </tr>
    );
}

// 배송 취소 탭의 한 행. 읽기 전용이라 입력·버튼 없이 취소 사유와 시각을 보여 준다.
function CanceledRow({ delivery }: { delivery: SellerDeliveryResponse }) {
    const items = delivery.items ?? [];
    return (
        <tr className="hover:bg-surface-container-low transition-colors">
            <td className="p-space-md">
                <div className="font-label-md text-primary">{delivery.orderNumber ?? `#${delivery.orderId ?? '-'}`}</div>
                <div className="text-caption text-on-surface-variant">{formatDateTime(delivery.createdAt)}</div>
            </td>
            <td className="p-space-md">
                {items.map((item) => (
                    <div key={item.deliveryItemId} className="font-label-md">
                        {item.productName ?? '상품 정보 없음'}
                    </div>
                ))}
            </td>
            <td className="p-space-md text-center font-label-md">{totalQuantity(delivery)}</td>
            <td className="p-space-md">
                <div className="font-label-md">{delivery.receiverName}</div>
            </td>
            <td className="p-space-md text-center">
                <Badge label={STATUS_LABEL.CANCELED} />
            </td>
            <td className="p-space-md">
                {/* 사유 칸이 생기기 전에 취소된 배송은 사유가 없다 */}
                <div className="font-label-md">{deliveryCancelLabel(delivery.cancelReason) ?? '사유 기록 없음'}</div>
                <div className="text-caption text-on-surface-variant">{formatDateTime(delivery.canceledAt)}</div>
                {delivery.trackingNumber && (
                    <div className="text-caption text-on-surface-variant">
                        송장 {delivery.carrier} {delivery.trackingNumber}
                    </div>
                )}
            </td>
        </tr>
    );
}

function TableSkeleton() {
    return (
        <div className="flex flex-col gap-space-sm p-space-lg" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-16 bg-surface-container-low animate-pulse rounded-lg" />
            ))}
        </div>
    );
}

// 판매자 배송 목록. 상태(status)와 페이지(page)는 URL 쿼리스트링에서 읽는다. (탭이 같은 쿼리를 바꾼다)
export default function ShippingList() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const status = readShippingStatus(searchParams.get('status'));
    const page = readPage(searchParams.get('page'));

    const queryClient = useQueryClient();
    const query = useGetSellerDeliveries({ status, page: page - 1, size: PAGE_SIZE });
    const result = query.data?.data;
    const rows = result?.content ?? [];
    const canceledTab = status === GetSellerDeliveriesStatus.CANCELED;
    // 배송요청·배송준비 탭에서만 골라서 한꺼번에 취소할 수 있다.
    const selectable = isCancelable(status);

    // 선택은 지금 보고 있는 탭·페이지 안에서만 유지한다. 탭이나 페이지를 바꾸면 빈 선택으로 시작한다.
    const selectionKey = `${status}-${page}`;
    const [selection, setSelection] = useState<{ key: string; ids: number[] }>({ key: selectionKey, ids: [] });
    const visibleIds = new Set(rows.map((row) => row.deliveryId));
    const selectedIds = selection.key === selectionKey ? selection.ids.filter((id) => visibleIds.has(id)) : [];
    const selectedRows = rows.filter((row) => row.deliveryId !== undefined && selectedIds.includes(row.deliveryId));
    const allSelected = rows.length > 0 && selectedRows.length === rows.length;
    const [cancelTargets, setCancelTargets] = useState<SellerDeliveryResponse[] | null>(null);

    function toggle(id: number) {
        setSelection({ key: selectionKey, ids: selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id] });
    }

    function toggleAll() {
        setSelection({ key: selectionKey, ids: allSelected ? [] : rows.flatMap((row) => (row.deliveryId === undefined ? [] : [row.deliveryId])) });
    }

    // 취소 요청이 끝나면 목록을 다시 받는다. 취소된 배송은 이 탭에서 빠지고, 실패한 건은 선택된 채로 남긴다.
    function onCancelSettled(failedIds: number[]) {
        setSelection({ key: selectionKey, ids: failedIds });
        void queryClient.invalidateQueries({ queryKey: getGetSellerDeliveriesQueryKey() });
    }
    const totalElements = result?.totalElements ?? 0;
    const totalPages = result?.totalPages ?? 0;
    const from = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = (page - 1) * PAGE_SIZE + rows.length;

    function goPage(next: number) {
        const params = new URLSearchParams(searchParams.toString());
        if (next > 1) params.set('page', String(next));
        else params.delete('page');
        const queryString = params.toString();
        router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    }

    const first = Math.max(1, page - PAGE_WINDOW);
    const last = Math.min(totalPages, page + PAGE_WINDOW);
    const pages = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);

    return (
        <>
            {/* Order List Table Section */}
            <Card className="overflow-hidden mb-space-xl" padding={0}>
                <div className="px-space-lg py-space-md border-b border-surface-variant flex items-center justify-between">
                    <div className="flex items-center gap-space-sm">
                        <Heading level={2}>주문 목록</Heading>
                        {result && <span className="text-caption bg-surface-container-high text-on-surface px-2 py-0.5 rounded-full">총 {totalElements}건</span>}
                    </div>
                    {selectable && (
                        <div className="flex items-center gap-space-sm text-body-sm text-on-surface-variant">
                            <span>
                                선택된 항목 <span className="font-label-md text-on-surface">{selectedRows.length}건</span>
                            </span>
                            <Button label="선택 취소" variant="destructive" size="sm" isDisabled={selectedRows.length === 0} onClick={() => setCancelTargets(selectedRows)} />
                        </div>
                    )}
                </div>
                {query.isPending ? (
                    <TableSkeleton />
                ) : query.isError ? (
                    <div className="p-space-xl flex flex-col items-center gap-space-sm text-center" role="alert">
                        <p className="font-body-md text-on-surface">{errorMessage(query.error, '배송 목록을 불러오지 못했습니다.')}</p>
                        <Button label="다시 시도" onClick={() => query.refetch()} />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-space-xl flex flex-col items-center gap-space-xs text-center text-on-surface-variant">
                        <Icon name="inbox" className="text-[32px]" />
                        <p className="font-body-md">{totalElements > 0 ? '이 페이지에는 배송 건이 없습니다.' : '배송 건이 없습니다.'}</p>
                        {totalElements > 0 && (
                            <button className="mt-space-xs text-primary font-label-md underline" type="button" onClick={() => goPage(1)}>
                                첫 페이지로
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-container-low border-b border-surface-variant text-caption font-label-md text-on-surface-variant uppercase">
                                    {selectable && (
                                        <th className="p-space-md w-10">
                                            <CheckboxInput label="이 페이지 전체 선택" isLabelHidden size="sm" value={allSelected ? true : selectedRows.length > 0 ? 'indeterminate' : false} onChange={toggleAll} />
                                        </th>
                                    )}
                                    <th className="p-space-md">주문번호 / 일시</th>
                                    <th className="p-space-md">상품명 / 옵션</th>
                                    <th className="p-space-md text-center">수량</th>
                                    <th className="p-space-md">수령인 / 연락처</th>
                                    <th className="p-space-md text-center">배송상태</th>
                                    <th className="p-space-md">{canceledTab ? '취소 사유 / 시각' : '송장등록 입력'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-variant text-body-md text-on-surface">
                                {rows.map((delivery) =>
                                    canceledTab ? (
                                        <CanceledRow key={delivery.deliveryId} delivery={delivery} />
                                    ) : (
                                        // 행 안의 입력값·오류 상태를 상태나 송장 정보가 바뀌면 새로 시작하도록 key 에 포함한다.
                                        <DeliveryRow
                                            key={`${delivery.deliveryId}-${delivery.status}-${delivery.carrier ?? ''}-${delivery.trackingNumber ?? ''}`}
                                            delivery={delivery}
                                            selectable={selectable}
                                            selected={delivery.deliveryId !== undefined && selectedIds.includes(delivery.deliveryId)}
                                            onToggle={() => delivery.deliveryId !== undefined && toggle(delivery.deliveryId)}
                                            onCancel={() => setCancelTargets([delivery])}
                                        />
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                {/* Pagination */}
                <div className="p-space-md border-t border-surface-variant flex items-center justify-between">
                    <div className="text-body-sm text-on-surface-variant">
                        {from}-{to} of {totalElements} items
                    </div>
                    <div className="flex items-center gap-space-xs">
                        <button className="w-8 h-8 rounded border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-container-low disabled:opacity-50" disabled={page <= 1} aria-label="이전 페이지" onClick={() => goPage(page - 1)}>
                            <Icon name="chevron_left" className="text-[16px]" />
                        </button>
                        {pages.map((n) => (
                            <button
                                key={n}
                                aria-current={n === page ? 'page' : undefined}
                                className={n === page ? 'w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center font-label-md' : 'w-8 h-8 rounded border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-container-low font-label-md'}
                                onClick={() => goPage(n)}
                            >
                                {n}
                            </button>
                        ))}
                        <button className="w-8 h-8 rounded border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-container-low disabled:opacity-50" disabled={totalPages === 0 || page >= totalPages} aria-label="다음 페이지" onClick={() => goPage(page + 1)}>
                            <Icon name="chevron_right" className="text-[16px]" />
                        </button>
                    </div>
                </div>
            </Card>
            {cancelTargets && <CancelDeliveryDialog deliveries={cancelTargets} onClose={() => setCancelTargets(null)} onSettled={onCancelSettled} />}
        </>
    );
}
