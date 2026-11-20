import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { withRunId } from './run';

// 구매 흐름 공용 도우미. 판매글 · 잔액 같은 "준비물"은 API로 만들고, 검증하려는 화면은 UI로 돈다.
// 브라우저와 같은 FE 출처(/api/*)로 보내므로 storageState의 쿠키가 그대로 쓰인다.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export type CreatedPost = { postId: number; title: string; productName: string; inventoryId: number; price: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
    if (!res.ok()) throw new Error(`${what} 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: T };
    return (body?.data ?? body) as T;
}

/** 로그인한 판매자(request)가 판매글을 API로 등록하고, 목록 · 상세에서 id를 찾아 돌려준다. */
export async function createPost(
    seller: APIRequestContext,
    opts: { name: string; price: number; stock?: number } = { name: '테스트 상품', price: 10_000 },
): Promise<CreatedPost> {
    const sellerInfo = await json(await seller.get('/api/members/me/seller'), '판매자 정보 조회');
    const sellerId = Number(sellerInfo.id ?? sellerInfo.sellerId);
    const title = withRunId(opts.name);
    const res = await seller.post('/api/sales-posts', {
        multipart: {
            request: {
                name: 'request',
                mimeType: 'application/json',
                buffer: Buffer.from(
                    JSON.stringify({
                        sellerId,
                        title,
                        content: `${opts.name} 설명`,
                        productList: [
                            {
                                categoryId: 1,
                                name: opts.name,
                                description: `${opts.name} 상세 설명`,
                                basePrice: opts.price,
                                productImageList: [{ imageSeq: 1 }],
                                inventoryList: [{ optionList: [], additionalPrice: 0, stockQuantity: opts.stock ?? 50 }],
                            },
                        ],
                    }),
                ),
            },
            images: { name: 'img.png', mimeType: 'image/png', buffer: PNG },
        },
    });
    if (!res.ok()) throw new Error(`판매글 등록 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);

    const list = await json(await seller.get(`/api/sales-posts/sellers/${sellerId}/posts?page=0&size=50`), '내 판매글 목록');
    const post = (list.content ?? []).find((p: { title?: string }) => p.title === title);
    if (!post) throw new Error(`방금 등록한 판매글(${title})을 내 판매글 목록에서 찾지 못했습니다.`);
    const postId = Number(post.postId ?? post.id);
    const detail = await json(await seller.get(`/api/sales-posts/detail/${postId}`), '판매글 상세');
    const product = detail.productList?.[0];
    const inventory = product?.inventoryList?.[0];
    const inventoryId = Number(inventory?.inventoryId ?? inventory?.id);
    if (!inventoryId) throw new Error(`재고 id를 찾지 못했습니다: ${JSON.stringify(detail).slice(0, 300)}`);
    return { postId, title, productName: opts.name, inventoryId, price: opts.price };
}

/** 지금 예치금 잔액(API). */
export async function walletBalance(request: APIRequestContext): Promise<number> {
    const w = await json(await request.get('/api/wallets/me'), '예치금 조회');
    return Number(w.balance);
}

/** 장바구니에 담긴 항목 수(API). */
export async function cartCount(request: APIRequestContext): Promise<number> {
    const cart = await json(await request.get('/api/carts'), '장바구니 조회');
    return (cart.items ?? []).length;
}

/** 장바구니를 비운다(테스트 시작 전 정리). */
export async function clearCart(request: APIRequestContext): Promise<void> {
    const res = await request.delete('/api/carts/items');
    if (!res.ok() && res.status() !== 404) throw new Error(`장바구니 비우기 실패: ${res.status()}`);
}

/** 주문서(/checkout?order=…)의 배송지를 채운다. 받는 분은 기본값이 비어 있다. */
export async function fillDelivery(page: Page, receiver = 'e2e 수령인') {
    await page.getByLabel('받는 분').fill(receiver);
    if (!(await page.getByLabel('연락처').inputValue())) await page.getByLabel('연락처').fill('010-9000-1234');
    if (!(await page.getByLabel('우편번호').inputValue())) await page.getByLabel('우편번호').fill('06234');
    if (!(await page.getByLabel('주소', { exact: true }).inputValue())) await page.getByLabel('주소', { exact: true }).fill('서울특별시 강남구 테헤란로 123');
}

/** 주문서에서 동의 · 주문하기를 눌러 접수 화면(?order=)까지 간다. 주문 id를 돌려준다. */
export async function submitOrderForm(page: Page): Promise<number> {
    await page.getByText('주문 상품, 배송지, 주문 금액을 확인했습니다.').click();
    await page.getByRole('button', { name: /주문하기$/ }).click();
    await expect(page.getByRole('heading', { name: '주문이 접수되었습니다' })).toBeVisible();
    const id = Number(new URL(page.url()).searchParams.get('order'));
    expect(id).toBeGreaterThan(0);
    return id;
}

import type { PlaywrightWorkerArgs } from '@playwright/test';
import { authFile, type AccountKey } from './auth';

/** 다른 계정으로 API를 부르는 요청 컨텍스트(예: 구매자 테스트 안에서 판매자 판매글 등록). 쓰고 나면 dispose한다. */
export async function apiAs(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string | undefined, key: AccountKey): Promise<APIRequestContext> {
    return playwright.request.newContext({ baseURL, storageState: authFile(key) });
}

/** 장바구니에 재고를 담는다(API). */
export async function addToCart(request: APIRequestContext, inventoryId: number, quantity = 1): Promise<void> {
    const res = await request.post('/api/carts/items', { data: { inventoryId, quantity } });
    if (!res.ok()) throw new Error(`장바구니 담기 실패: ${res.status()} ${(await res.text()).slice(0, 200)}`);
}
