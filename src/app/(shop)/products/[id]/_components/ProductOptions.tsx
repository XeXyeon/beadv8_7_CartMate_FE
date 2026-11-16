'use client';

import { formatPrice, isOptionAvailable, type InventoryChoice, type ProductOption } from '@/lib/salesPost';
import { Text } from '@astryxdesign/core/Text';

type Props = {
    products: ProductOption[];
    selectedId: number | null;
    selectedOptions: Record<number, number>;
    inventory: InventoryChoice | null; // 고른 상품 · 옵션 조합의 재고. 아직 다 고르지 않았으면 null
    quantity: number;
    disabled: boolean;
    onSelect: (productId: number) => void;
    onOptionChange: (typeId: number, optionId: number | null) => void;
    onQuantityChange: (quantity: number) => void;
};

const SELECT_CLASS =
    'h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-space-md text-on-surface focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

// 판매글 안의 상품을 고르고, 그 상품의 옵션 종류별 상품옵션을 골라 재고(조합)를 정한 뒤 수량을 정한다.
// 수량은 그 재고의 구매 가능 수량(재고 - 선점)까지, 가격은 그 재고의 판매가(기본가 + 추가 금액)로 계산한다
export default function ProductOptions({
    products,
    selectedId,
    selectedOptions,
    inventory,
    quantity,
    disabled,
    onSelect,
    onOptionChange,
    onQuantityChange,
}: Props) {
    const selected = products.find((p) => p.id === selectedId) ?? null;
    const soldOut = inventory != null && inventory.available <= 0;
    const maxQuantity = inventory?.available ?? 0;
    const quantityLocked = disabled || inventory == null || soldOut;
    const unitPrice = inventory?.price ?? selected?.price ?? null;

    return (
        <>
            <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between">
                    <Text weight="semibold">상품 선택</Text>
                    {selected && <Text type="supporting" color="secondary">선택: {selected.name}</Text>}
                </div>
                <div className="flex flex-col gap-space-xs" role="radiogroup" aria-label="상품 선택">
                    {products.map((product) => {
                        const active = product.id === selectedId;
                        const unavailable = disabled || !product.onSale;
                        return (
                            <button
                                key={product.id}
                                className={`flex items-center justify-between rounded-lg px-4 py-3 text-left font-label-sm text-label-sm transition-colors ${
                                    active
                                        ? 'border-2 border-primary bg-primary-container text-primary font-bold'
                                        : 'border border-outline-variant bg-surface-container-lowest text-on-surface hover:border-outline'
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={unavailable}
                                onClick={() => onSelect(product.id)}
                            >
                                <span>
                                    {product.name}
                                    {!product.onSale && <span className="ml-space-xs font-caption text-caption text-error">판매 중지</span>}
                                </span>
                                <span>{product.price === null ? '가격 문의' : formatPrice(product.price)}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {selected && selected.optionGroups.length > 0 && (
                <div className="flex flex-col gap-space-sm">
                    {selected.optionGroups.map((group) => (
                        <label key={group.typeId} className="flex flex-col gap-1">
                            <Text weight="semibold">{group.typeName}</Text>
                            <select
                                className={SELECT_CLASS}
                                disabled={disabled}
                                value={selectedOptions[group.typeId] ?? ''}
                                onChange={(e) => onOptionChange(group.typeId, e.target.value === '' ? null : Number(e.target.value))}
                            >
                                <option value="">{group.typeName} 선택</option>
                                {group.options.map((option) => {
                                    const available = isOptionAvailable(selected, selectedOptions, group.typeId, option.optionId);
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
                </div>
            )}

            {inventory && (
                <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-space-md py-space-sm">
                    <Text type="supporting">{inventory.skuName}</Text>
                    <Text type="supporting" className={soldOut ? 'text-error font-semibold' : 'text-on-surface-variant'}>
                        {soldOut ? '품절' : `${formatPrice(inventory.price)} · 남은 수량 ${inventory.available.toLocaleString('ko-KR')}개`}
                    </Text>
                </div>
            )}

            <div className="my-1 flex flex-wrap items-center justify-between gap-3 border-y border-outline-variant py-4">
                <Text weight="semibold">수량 선택</Text>
                <div className="flex items-center gap-space-md">
                    <div className="flex items-center overflow-hidden rounded-lg border border-outline bg-surface-container-lowest">
                        <button
                            className="w-8 h-8 flex items-center justify-center font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                            type="button"
                            aria-label="수량 줄이기"
                            disabled={quantityLocked || quantity <= 1}
                            onClick={() => onQuantityChange(quantity - 1)}
                        >
                            -
                        </button>
                        <input
                            className="w-10 h-8 text-center font-label-md text-label-md bg-transparent border-x border-outline focus:outline-none"
                            readOnly
                            type="text"
                            aria-label="수량"
                            value={quantity}
                        />
                        <button
                            className="w-8 h-8 flex items-center justify-center font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                            type="button"
                            aria-label="수량 늘리기"
                            disabled={quantityLocked || quantity >= maxQuantity}
                            onClick={() => onQuantityChange(quantity + 1)}
                        >
                            +
                        </button>
                    </div>
                    <div className="text-right min-w-[120px]">
                        <span className="font-caption text-caption text-secondary block">합계</span>
                        <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                            {inventory == null || unitPrice == null ? '-' : formatPrice(unitPrice * quantity)}
                        </span>
                    </div>
                </div>
            </div>
            {selected && selected.optionGroups.length > 0 && inventory == null && (
                <Text type="supporting" color="secondary">옵션을 모두 고르면 가격과 남은 수량이 나옵니다.</Text>
            )}
        </>
    );
}
