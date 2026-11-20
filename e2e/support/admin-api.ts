import type { APIRequestContext } from '@playwright/test';

// 관리자 흐름(E14)이 판매글을 만들 때 쓰는 API 도우미. 판매자 로그인 상태(storageState)를 가진 request로 호출한다.
// 화면 흐름(판매글 등록 UI)은 QA-3 E05가 검증하므로 여기서는 준비 단계만 API로 한다.

// 1×1 PNG. 판매글 등록은 이미지가 있어야 한다.
const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

/** 로그인한 판매자 본인의 seller id. */
export async function mySellerId(request: APIRequestContext): Promise<number> {
    const res = await request.get('/api/members/me/seller');
    if (!res.ok()) throw new Error(`판매자 정보 조회 실패: ${res.status()}`);
    const id = ((await res.json()) as { data?: { id?: number } }).data?.id;
    if (typeof id !== 'number') throw new Error('판매자 id를 찾지 못했습니다.');
    return id;
}

/** 판매글 1개(상품 1개 · 옵션 없음 · 재고 10)를 만든다. 응답 본문이 비어 있어 id는 호출한 쪽이 목록에서 찾는다. */
export async function createSalesPost(request: APIRequestContext, sellerId: number, title: string): Promise<void> {
    const res = await request.post('/api/sales-posts', {
        multipart: {
            request: {
                name: 'request.json',
                mimeType: 'application/json',
                buffer: Buffer.from(
                    JSON.stringify({
                        sellerId,
                        title,
                        content: `${title} 본문`,
                        productList: [
                            {
                                categoryId: 1,
                                name: 'E2E 상품',
                                description: 'E2E 상품 설명',
                                basePrice: 10000,
                                productImageList: [{ imageSeq: 1 }],
                                inventoryList: [{ optionList: [], additionalPrice: 0, stockQuantity: 10 }],
                            },
                        ],
                    }),
                ),
            },
            images: { name: 'img.png', mimeType: 'image/png', buffer: PNG_1X1 },
        },
    });
    if (!res.ok()) throw new Error(`판매글 등록 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
}
