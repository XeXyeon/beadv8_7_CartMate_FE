import type { SelectSalesPostProduct, SelectSalesPostResponse } from '@/api/generated/model';

// 판매글(SelectSalesPostResponse)을 상품 카드에 필요한 값으로 바꾼다.
export type SalesPostCardModel = {
    id: number;
    title: string;
    productName: string | null;
    // 판매글에 상품이 여러 개면 가장 낮은 기본가를 "~부터" 가격으로 쓴다.
    minPrice: number | null;
    productCount: number;
    imageUrl: string | null;
};

// 로컬 BE는 /images/**로 파일을 제공하고, 다른 저장소는 완성된 URL 또는 저장 키를 돌려줄 수 있다.
const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? '/images';

export function imageUrl(s3key: string | undefined): string | null {
    if (!s3key) return null;
    if (/^https?:\/\//.test(s3key) || s3key.startsWith('/images/')) return s3key;
    return `${IMAGE_BASE_URL.replace(/\/$/, '')}/${s3key.replace(/^\//, '')}`;
}

export function toSalesPostCard(post: SelectSalesPostResponse): SalesPostCardModel | null {
    if (post.id === undefined) return null;
    const products = post.productList ?? [];
    const prices = products.map((p) => p.basePrice).filter((price): price is number => typeof price === 'number');
    const firstImage = products
        .flatMap((p) => p.productImageList ?? [])
        .sort((a, b) => (a.imageSeq ?? 0) - (b.imageSeq ?? 0))[0];

    return {
        id: post.id,
        title: post.title ?? '',
        productName: products[0]?.name ?? null,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        productCount: products.length,
        imageUrl: imageUrl(firstImage?.s3key),
    };
}

// 판매글 상세 응답의 상품별 선택 목록 · 재고 (BE SelectSalesPostOptionGroup · SelectSalesPostInventory).
// 생성 타입(orval)에 아직 없어 BE 응답 모양대로 적는다. 목록 조회에서는 둘 다 빈 목록이다
type RawOptionGroup = { typeId?: number; typeName?: string; options?: { optionId?: number; name?: string }[] };
type RawInventory = {
    inventoryId?: number;
    skuName?: string;
    appliedPrice?: number;
    additionalPrice?: number;
    stockQuantity?: number; // 판매글 상세에서는 구매 가능 수량(재고 - 선점)
    optionIds?: number[];
};

// 옵션 종류 하나와 고를 수 있는 상품옵션 (예: 신발 사이즈 → 265, 270)
export type OptionGroup = { typeId: number; typeName: string; options: { optionId: number; name: string }[] };

// 재고 하나 = 상품옵션 조합 하나. 장바구니 · 주문은 이 inventoryId로 담는다
export type InventoryChoice = {
    inventoryId: number;
    skuName: string; // 예: "265 / 블랙", 옵션이 없으면 "기본"
    price: number; // 판매가 = 기본가 + 추가 금액
    available: number; // 지금 살 수 있는 수량
    optionIds: number[];
};

// 상품 상세에서 고를 수 있는 상품 한 줄
export type ProductOption = {
    id: number;
    name: string;
    description: string;
    price: number | null;
    onSale: boolean;
    imageUrls: string[];
    optionGroups: OptionGroup[];
    inventories: InventoryChoice[];
};

export function toProductOption(product: SelectSalesPostProduct): ProductOption | null {
    if (product.id === undefined) return null;
    const raw = product as SelectSalesPostProduct & { optionGroups?: RawOptionGroup[]; inventoryList?: RawInventory[] };
    return {
        id: product.id,
        name: product.name ?? '',
        description: product.description ?? '',
        price: typeof product.basePrice === 'number' ? product.basePrice : null,
        onSale: product.status === 'ON_SALE',
        imageUrls: [...(product.productImageList ?? [])]
            .sort((a, b) => (a.imageSeq ?? 0) - (b.imageSeq ?? 0))
            .map((image) => imageUrl(image.s3key))
            .filter((url): url is string => url !== null),
        optionGroups: (raw.optionGroups ?? [])
            .filter((g) => g.typeId != null)
            .map((g) => ({
                typeId: g.typeId as number,
                typeName: g.typeName ?? '',
                options: (g.options ?? [])
                    .filter((o) => o.optionId != null)
                    .map((o) => ({ optionId: o.optionId as number, name: o.name ?? '' })),
            })),
        inventories: (raw.inventoryList ?? [])
            .filter((i) => i.inventoryId != null)
            .map((i) => ({
                inventoryId: i.inventoryId as number,
                skuName: i.skuName ?? '',
                price: i.appliedPrice ?? (product.basePrice ?? 0) + (i.additionalPrice ?? 0),
                available: Math.max(i.stockQuantity ?? 0, 0),
                optionIds: i.optionIds ?? [],
            })),
    };
}

// 고른 상품옵션(옵션 종류별 하나)으로 재고를 찾는다. 옵션이 없는 상품은 하나뿐인 "기본" 재고.
// 아직 다 고르지 않았거나 그런 조합의 재고가 없으면 null
export function findInventory(product: ProductOption, selected: Record<number, number>): InventoryChoice | null {
    if (product.optionGroups.length === 0) return product.inventories[0] ?? null;
    if (product.optionGroups.some((g) => selected[g.typeId] == null)) return null;
    const picked = product.optionGroups.map((g) => selected[g.typeId]);
    return product.inventories.find((inv) => picked.every((id) => inv.optionIds.includes(id))) ?? null;
}

// 이 상품옵션을 고르면 살 수 있는 재고가 하나라도 있는지 (이미 고른 다른 옵션 종류와 함께). 없으면 품절로 보여 준다
export function isOptionAvailable(product: ProductOption, selected: Record<number, number>, typeId: number, optionId: number): boolean {
    const others = product.optionGroups
        .filter((g) => g.typeId !== typeId && selected[g.typeId] != null)
        .map((g) => selected[g.typeId]);
    return product.inventories.some(
        (inv) => inv.available > 0 && inv.optionIds.includes(optionId) && others.every((id) => inv.optionIds.includes(id)),
    );
}

const PRICE_FORMAT = new Intl.NumberFormat('ko-KR');

export function formatPrice(price: number): string {
    return `${PRICE_FORMAT.format(price)}원`;
}
