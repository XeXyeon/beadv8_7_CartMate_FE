import { http, type RsData } from '@/api/http';
import type { InventoryRow, InventoryTableState } from '../../../new/_components/OptionTable';

// 수정 화면에 필요한 데이터는 두 API에서 받는다.
// - 판매글(제목 · 본문 · 판매자 · 상태): GET /api/sales-posts/detail/{postId}
// - 상품(이미지 · 재고): GET /api/products/{postId}
//   판매글 상세의 재고 수량은 구매 가능 수량(재고 - 선점)이라, 그대로 다시 보내면 실제 재고가 줄어든다.
//   그래서 원래 재고 수량 · 선점 수량이 있는 상품 API를 쓴다.
// 생성 타입(orval)은 재고 도입 전 스펙이라 BE 응답 모양대로 직접 적는다.

type EditPost = {
    id: number;
    sellerId: number;
    title: string;
    content: string;
    status: string;
    updateStatus?: string;
};

type EditProductImage = { id: number; s3key: string; imageSeq: number; status?: string };
type EditProductOption = { productTypeId: number; productOptionId: number };
type EditInventory = {
    id: number;
    additionalPrice: number;
    stockQuantity: number;
    reservedQuantity?: number;
    optionList: EditProductOption[];
};

export type EditProduct = {
    id: number;
    categoryId: number;
    name: string;
    description: string;
    basePrice: number;
    productImageList: EditProductImage[];
    inventoryList: EditInventory[];
};

export type EditSource = { post: EditPost; product: EditProduct };

// 판매글 하나에 상품 하나(등록 화면과 같은 구조)라 첫 상품만 쓴다
export async function fetchEditSource(postId: number): Promise<EditSource> {
    const [detail, products] = await Promise.all([
        http<RsData<EditPost>>(`/api/sales-posts/detail/${postId}`),
        http<RsData<EditProduct[]>>(`/api/products/${postId}`),
    ]);
    const product = products.data?.[0];
    if (!detail.data || !product) throw new Error('판매글 정보를 불러오지 못했습니다.');
    return { post: detail.data, product };
}

// 살아 있는 이미지만, 순서대로
export function activeImages(product: EditProduct): EditProductImage[] {
    return [...(product.productImageList ?? [])]
        .filter((image) => image.status == null || image.status === 'ACTIVE')
        .sort((a, b) => a.imageSeq - b.imageSeq);
}

// 기존 재고 → 재고 표. 옵션 종류(열) 순서는 첫 재고의 선택된 옵션 순서(= BE 재고 이름 순서)를 따른다
export function toInventoryTable(product: EditProduct): InventoryTableState {
    const inventories = product.inventoryList ?? [];
    const typeIds = (inventories[0]?.optionList ?? []).map((option) => option.productTypeId);
    const rows: InventoryRow[] = inventories.map((inventory, index) => ({
        key: index + 1,
        inventoryId: inventory.id,
        optionIds: Object.fromEntries(
            typeIds.map((typeId) => [
                typeId,
                inventory.optionList.find((option) => option.productTypeId === typeId)?.productOptionId ?? null,
            ]),
        ),
        additionalPrice: String(inventory.additionalPrice ?? 0),
        stockQuantity: String(inventory.stockQuantity ?? 0),
        reservedQuantity: inventory.reservedQuantity ?? 0,
    }));
    return { typeIds, rows, nextKey: rows.length + 1 };
}

// 수정 요청의 재고 하나 (BE UpdateSalesPostInventory)
// id가 있으면 기존 재고의 추가금액 · 재고 수량만 바뀌고(optionList는 BE가 보지 않음), 없으면 새 재고가 된다.
// 요청에 없는 기존 재고는 BE가 삭제 상태로 바꾼다
type UpdateInventoryRequest = {
    id?: number;
    optionList: EditProductOption[];
    additionalPrice: number;
    stockQuantity: number;
};

export function toUpdateInventories(table: InventoryTableState): UpdateInventoryRequest[] {
    return table.rows.map((row) => ({
        ...(row.inventoryId != null && { id: row.inventoryId }),
        optionList: table.typeIds.map((typeId) => ({
            productTypeId: typeId,
            productOptionId: row.optionIds[typeId] as number,
        })),
        additionalPrice: Number(row.additionalPrice),
        stockQuantity: Number(row.stockQuantity),
    }));
}

// 수정 요청의 이미지 하나 (BE UpdateSalesPostProductImage)
// id가 있으면 기존 이미지(순서만 바뀜), 없으면 새 이미지 — 새 이미지 파일은 images에 이 순서대로 넣는다.
// 요청에 없는 기존 이미지는 BE가 지운다
export type UpdateImageRequest = { id?: number; imageSeq: number };

export type UpdateSalesPostRequest = {
    id: number;
    sellerId: number;
    title: string;
    content: string;
    productList: {
        id: number;
        categoryId: number;
        name: string;
        description: string;
        basePrice: number;
        productImageList: UpdateImageRequest[];
        inventoryList: UpdateInventoryRequest[];
    }[];
};

// PATCH /api/sales-posts (multipart: request JSON + 새 이미지 파일)
// 생성 코드는 request를 문자열로 넣어 Spring @RequestPart 바인딩이 깨질 수 있어 등록처럼 Blob으로 보낸다.
export function updateSalesPostMultipart(request: UpdateSalesPostRequest, newImages: Blob[]) {
    const formData = new FormData();
    formData.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    for (const image of newImages) {
        formData.append('images', image);
    }
    return http<void>('/api/sales-posts', { method: 'PATCH', body: formData });
}
