'use client';

import { useState } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import type { SharedGroupPurchaseDetailItemResponse } from '@/api/generated/model';
import { useSelectSalesPostDetail } from '@/api/generated/sales-post-controller/sales-post-controller';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { findInventory, formatPrice, isOptionAvailable, toProductOption } from '@/lib/salesPost';
import ItemThumb from '../../../_components/ItemThumb';
import Notice from '../../../_components/Notice';
import SharedDetailGate, { type SharedDetailContext } from '../../../_components/SharedDetailGate';
import { DetailSkeleton } from '../../../_components/SharedStatusParts';
import { itemPermissions, MAX_QUANTITY, remainingText } from '../../../_lib/sharedGroupPurchase';
import { useSharedItemMutations } from '../../../_lib/useSharedItemMutations';
import SalesProductPicker, { type PickedProduct } from './SalesProductPicker';

// 범위는 BE SharedGroupPurchaseItemAddRequest 검증(1~999)과 맞춘다.
const quantitySchema = z.object({
    quantity: z
        .number({ error: '수량을 입력해주세요.' })
        .int('정수로 입력해주세요.')
        .min(1, '1개 이상 담아주세요.')
        .max(MAX_QUANTITY, `${MAX_QUANTITY}개 이하로 담아주세요.`),
});

type QuantityValues = z.infer<typeof quantitySchema>;

// 판매 상품을 골라 옵션(재고)을 정하고 공동 장바구니에 담는다. 같은 옵션을 다시 담으면 BE가 수량을 더한다.
// 이미 담긴 상품을 고르면 담긴 품목의 옵션을 지금 고른 옵션으로 바꿀 수 있다(GP-9).
// 옵션 변경을 공동 장바구니가 아니라 여기서 하는 이유: 품목 응답에 판매글 id가 없어 옵션 목록을 받을 수 없다.
export default function AddItemView() {
    return <SharedDetailGate skeleton={<DetailSkeleton />}>{(ctx) => <AddItemContent {...ctx} />}</SharedDetailGate>;
}

type Mutations = ReturnType<typeof useSharedItemMutations>;

function AddItemContent({ id, purchase, remainingMs, deadlinePassed }: SharedDetailContext) {
    const { canAdd, canChangeOption } = itemPermissions(purchase, deadlinePassed);
    const items = purchase.items ?? [];
    const inCartIds = new Set(items.map((item) => item.productId).filter((v): v is number => v !== undefined));
    const [picked, setPicked] = useState<PickedProduct | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const mutations = useSharedItemMutations(id);

    if (!canAdd && !canChangeOption) {
        return <Notice message="수정이 마감되어 더 이상 상품을 담거나 바꿀 수 없습니다." href={ROUTES.groupPurchase(id)} linkLabel="공동구매 현황으로" />;
    }

    const onSelect = (product: PickedProduct) => {
        setPicked(product);
        setDone(null);
        mutations.add.reset();
        mutations.changeOption.reset();
    };

    const sameProductItems = picked ? items.filter((item) => item.productId === picked.productId) : [];

    return (
        <div className="flex flex-col gap-space-lg">
            <section className="flex flex-col gap-space-sm">
                <nav className="flex flex-wrap items-center gap-2 text-secondary font-body-sm text-body-sm">
                    <Link className="hover:text-primary" href={ROUTES.groupPurchases}>
                        내 공동구매
                    </Link>
                    <Icon name="chevron_right" className="text-[14px] text-outline" />
                    <Link className="text-primary font-medium break-all" href={ROUTES.groupPurchase(id)}>
                        {purchase.title}
                    </Link>
                    <Icon name="chevron_right" className="text-[14px] text-outline" />
                    <span className="text-primary font-semibold">상품 담기</span>
                </nav>
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-space-md flex flex-wrap items-center justify-between gap-space-md">
                    <div className="flex flex-wrap items-center gap-2 text-secondary font-body-sm text-body-sm">
                        <span>
                            참여 인원: <strong className="text-primary">{purchase.participantCount ?? 0}명</strong> / 최대 {purchase.maxParticipants ?? '-'}명
                        </span>
                        <span className="text-outline">/</span>
                        <span>
                            담긴 상품: <strong className="text-primary">{items.length}종</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-space-sm bg-surface-container-low px-3 py-1.5 rounded border border-outline-variant">
                        <Icon name="schedule" className="text-[18px] text-primary" />
                        <span className="font-body-sm text-body-sm text-on-surface">
                            수정 마감: <strong className="font-semibold text-primary">{remainingMs === null ? '-' : remainingText(remainingMs)}</strong>
                        </span>
                    </div>
                </div>
                {!canAdd && (
                    <p className="p-space-sm rounded bg-surface-container-high font-body-sm text-body-sm text-on-surface" role="status">
                        마감 보류 중이라 새 상품은 담을 수 없습니다. 만든 사람은 담긴 상품의 옵션만 바꿀 수 있습니다.
                    </p>
                )}
            </section>

            <div className="grid grid-cols-12 gap-gutter items-start">
                <Card className="col-span-12 lg:col-span-7 flex flex-col gap-space-md">
                    <div className="flex flex-col gap-1">
                        <Heading level={1}>상품 고르기</Heading>
                        <p className="font-body-sm text-body-sm text-secondary">
                            판매 중인 상품을 골라 공동 장바구니에 담습니다. 이미 담긴 상품을 고르면 옵션을 바꿀 수 있습니다.
                        </p>
                    </div>
                    <SalesProductPicker selectedId={picked?.productId ?? null} inCartIds={inCartIds} inCartOnly={!canAdd} onSelect={onSelect} />
                </Card>

                <section className="col-span-12 lg:col-span-5 lg:sticky lg:top-32 flex flex-col gap-space-md">
                    <div className="bg-surface-container-lowest border border-outline-variant rounded p-space-lg flex flex-col gap-space-md">
                        <Heading level={2}>{canAdd ? '담을 상품' : '옵션을 바꿀 상품'}</Heading>
                        {picked ? (
                            // 상품을 바꾸면 고른 옵션 · 수량을 처음부터 다시 고른다
                            <PickedPanel
                                key={picked.productId}
                                id={id}
                                picked={picked}
                                sameProductItems={sameProductItems}
                                canAdd={canAdd}
                                canChangeOption={canChangeOption}
                                mutations={mutations}
                                onDone={(message) => {
                                    setDone(message);
                                    setPicked(null);
                                }}
                            />
                        ) : (
                            <p className="p-space-lg bg-surface-container-low text-center font-body-sm text-body-sm text-on-surface-variant rounded">
                                왼쪽 목록에서 상품을 골라주세요.
                            </p>
                        )}
                        {done && (
                            <div className="p-space-sm rounded bg-surface-container-high flex items-center gap-space-xs" role="status">
                                <Icon name="check_circle" className="text-primary text-[18px]" />
                                <span className="font-body-sm text-body-sm text-on-surface">{done}</span>
                            </div>
                        )}
                    </div>
                    <Link
                        className="h-11 rounded bg-surface-container text-on-surface font-label-md text-label-md flex items-center justify-center gap-1.5 hover:bg-surface-variant"
                        href={ROUTES.groupPurchaseCart(id)}
                    >
                        <Icon name="shopping_cart" className="text-[18px]" />
                        공동 장바구니 보기 ({items.length}종)
                    </Link>
                </section>
            </div>
        </div>
    );
}

const SELECT_CLASS =
    'h-11 px-space-md border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface rounded focus:border-primary outline-none disabled:opacity-60';

type PickedPanelProps = {
    id: number;
    picked: PickedProduct;
    sameProductItems: SharedGroupPurchaseDetailItemResponse[]; // 이 상품으로 이미 담긴 품목(옵션별 한 줄)
    canAdd: boolean;
    canChangeOption: boolean;
    mutations: Mutations;
    onDone: (message: string) => void;
};

// 고른 상품의 옵션을 판매글 상세로 받아 재고를 정한 뒤 담거나, 담긴 품목의 옵션을 그 재고로 바꾼다.
function PickedPanel({ id, picked, sameProductItems, canAdd, canChangeOption, mutations, onDone }: PickedPanelProps) {
    const { add, changeOption } = mutations;
    const detail = useSelectSalesPostDetail(picked.postId);
    // 고른 상품옵션: 옵션 종류(typeId) → 상품옵션(optionId)
    const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<QuantityValues>({ resolver: zodResolver(quantitySchema), defaultValues: { quantity: 1 } });

    const rawProduct = detail.data?.data?.productList?.find((product) => product.id === picked.productId);
    const product = rawProduct ? toProductOption(rawProduct) : null;
    const inventory = product ? findInventory(product, selectedOptions) : null;
    const soldOut = inventory !== null && inventory.available <= 0;
    const busy = add.isPending || changeOption.isPending;

    const header = (
        <div className="flex items-start gap-space-md">
            <ItemThumb src={picked.imageUrl} className="w-20 h-20" />
            <div className="min-w-0">
                <span className="font-caption text-caption text-secondary block truncate">{picked.postTitle}</span>
                <h3 className="font-label-md text-label-md text-primary font-bold">{picked.name}</h3>
                <span className="font-body-sm text-body-sm text-on-surface">
                    {inventory ? formatPrice(inventory.price) : picked.price === null ? '가격 문의' : formatPrice(picked.price)}
                </span>
            </div>
        </div>
    );

    if (detail.isPending) {
        return (
            <>
                {header}
                <div className="h-24 bg-surface-container-low animate-pulse rounded" aria-hidden />
            </>
        );
    }
    if (detail.isError || !product) {
        return (
            <>
                {header}
                <div className="p-space-md bg-surface-container-low rounded flex flex-col items-center gap-space-sm text-center" role="alert">
                    <p className="font-body-sm text-body-sm text-on-surface">
                        {detail.isError ? errorMessage(detail.error, '상품 옵션을 불러오지 못했습니다.') : '상품 정보를 찾지 못했습니다. 다른 상품을 골라주세요.'}
                    </p>
                    {detail.isError && (
                        <button
                            className="h-9 px-space-md border border-outline-variant bg-surface-container-lowest font-label-sm text-label-sm hover:bg-surface-container"
                            type="button"
                            onClick={() => void detail.refetch()}
                        >
                            다시 시도
                        </button>
                    )}
                </div>
            </>
        );
    }

    const selectOption = (typeId: number, optionId: number | null) => {
        add.reset();
        changeOption.reset();
        setSelectedOptions((prev) => {
            const next = { ...prev };
            if (optionId === null) delete next[typeId];
            else next[typeId] = optionId;
            return next;
        });
    };

    const onSubmit = ({ quantity }: QuantityValues) => {
        if (!inventory || soldOut || busy) return;
        add.mutate(
            { id, data: { inventoryId: inventory.inventoryId, quantity } },
            { onSuccess: () => onDone(`'${picked.name}' (${optionLabel(inventory.skuName)}) ${quantity}개를 담았습니다.`) },
        );
    };

    const onChangeOption = (item: SharedGroupPurchaseDetailItemResponse) => {
        if (!inventory || soldOut || busy || item.itemId === undefined) return;
        const merging = sameProductItems.some((other) => other.itemId !== item.itemId && other.inventoryId === inventory.inventoryId);
        if (
            merging &&
            !window.confirm(`'${optionLabel(inventory.skuName)}' 옵션은 이미 담겨 있습니다.\n바꾸면 두 품목의 수량이 합쳐집니다. 바꿀까요?`)
        ) {
            return;
        }
        add.reset();
        changeOption.mutate(
            { id, itemId: item.itemId, data: { inventoryId: inventory.inventoryId } },
            {
                onSuccess: () =>
                    onDone(`'${picked.name}' 옵션을 '${optionLabel(item.optionName)}'에서 '${optionLabel(inventory.skuName)}'(으)로 바꿨습니다.`),
            },
        );
    };

    const existingSame = inventory ? sameProductItems.find((item) => item.inventoryId === inventory.inventoryId) : undefined;
    const noInventory = product.inventories.length === 0;

    return (
        <>
            {header}
            {product.optionGroups.map((group) => (
                <label key={group.typeId} className="flex flex-col gap-1">
                    <span className="font-label-sm text-label-sm text-on-surface">{group.typeName}</span>
                    <select
                        className={SELECT_CLASS}
                        disabled={busy}
                        value={selectedOptions[group.typeId] ?? ''}
                        onChange={(e) => selectOption(group.typeId, e.target.value === '' ? null : Number(e.target.value))}
                    >
                        <option value="">{group.typeName} 선택</option>
                        {group.options.map((option) => {
                            const available = isOptionAvailable(product, selectedOptions, group.typeId, option.optionId);
                            return (
                                <option key={option.optionId} value={option.optionId} disabled={!available}>
                                    {option.name}
                                    {!available && ' (품절)'}
                                </option>
                            );
                        })}
                    </select>
                </label>
            ))}
            {noInventory ? (
                <p className="font-caption text-caption text-error" role="alert">
                    이 상품은 지금 고를 수 있는 옵션이 없습니다.
                </p>
            ) : inventory ? (
                <div className="flex items-center justify-between rounded bg-surface-container-low px-space-md py-space-sm font-body-sm text-body-sm">
                    <span className="text-on-surface">{optionLabel(inventory.skuName)}</span>
                    <span className={soldOut ? 'text-error font-semibold' : 'text-on-surface-variant'}>
                        {soldOut ? '품절' : `남은 수량 ${inventory.available}개`}
                    </span>
                </div>
            ) : (
                <p className="font-caption text-caption text-secondary">옵션을 모두 골라주세요.</p>
            )}

            {sameProductItems.length > 0 && (
                <div className="flex flex-col gap-space-xs">
                    <span className="font-label-sm text-label-sm text-on-surface">이미 담긴 옵션</span>
                    <ul className="flex flex-col gap-space-xs">
                        {sameProductItems.map((item) => {
                            const current = inventory !== null && item.inventoryId === inventory.inventoryId;
                            return (
                                <li
                                    key={item.itemId}
                                    className="flex items-center justify-between gap-space-sm rounded border border-outline-variant px-space-md py-space-sm"
                                >
                                    <span className="font-body-sm text-body-sm text-on-surface min-w-0 truncate">
                                        {optionLabel(item.optionName)} · {item.quantity ?? 0}개
                                    </span>
                                    {canChangeOption && (
                                        <button
                                            className="h-8 px-space-sm shrink-0 border border-outline-variant rounded bg-surface-container-lowest font-label-sm text-label-sm hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                            type="button"
                                            disabled={!inventory || soldOut || current || busy}
                                            title={!inventory ? '바꿀 옵션을 먼저 골라주세요.' : current ? '지금 고른 옵션과 같습니다.' : undefined}
                                            onClick={() => onChangeOption(item)}
                                        >
                                            {changeOption.isPending && changeOption.variables?.itemId === item.itemId ? '바꾸는 중...' : '고른 옵션으로 바꾸기'}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            {changeOption.isError && (
                <p className="font-caption text-caption text-error" role="alert">
                    {errorMessage(changeOption.error, '옵션을 바꾸지 못했습니다.')}
                </p>
            )}

            {canAdd && (
                <form className="flex flex-col gap-space-md" onSubmit={handleSubmit(onSubmit)} noValidate>
                    <label className="flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-on-surface">수량</span>
                        <input
                            className="h-11 px-space-md border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface rounded focus:border-primary outline-none"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={MAX_QUANTITY}
                            aria-invalid={errors.quantity ? true : undefined}
                            {...register('quantity', { valueAsNumber: true })}
                        />
                        {errors.quantity && <span className="font-caption text-caption text-error">{errors.quantity.message}</span>}
                    </label>
                    {existingSame && (
                        <p className="font-caption text-caption text-secondary">
                            이 옵션이 이미 {existingSame.quantity ?? 0}개 담겨 있습니다. 담으면 수량이 더해집니다.
                        </p>
                    )}
                    {add.isError && (
                        <p className="font-caption text-caption text-error" role="alert">
                            {errorMessage(add.error, '상품을 담지 못했습니다.')}
                        </p>
                    )}
                    <Button
                        label={add.isPending ? '담는 중...' : '공동 장바구니에 담기'}
                        className="w-full"
                        type="submit"
                        size="lg"
                        variant="primary"
                        isLoading={add.isPending}
                        isDisabled={busy || !inventory || soldOut}
                        icon={<Icon name="add_shopping_cart" className="text-[20px]" />}
                    />
                </form>
            )}
        </>
    );
}

// BE는 옵션이 없는 상품의 재고 이름을 비워 두거나 "기본"으로 준다.
function optionLabel(name: string | undefined): string {
    return name && name.trim() !== '' ? name : '기본';
}
