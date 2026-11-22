import { expect, type APIRequestContext } from '@playwright/test';
import { addToCart, clearCart } from './shop';

// 배송 · 클레임 흐름(QA-6) 공용 도우미. 준비물(주문 · 결제 · 출고)은 API로 만들고, 검증하려는 화면만 UI로 돈다.
// 브라우저와 같은 FE 출처(/api/*)로 보내므로 storageState의 쿠키가 그대로 쓰인다.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function data<T = any>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
    if (!res.ok()) throw new Error(`${what} 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json().catch(() => ({}))) as { data?: T };
    return (body?.data ?? body) as T;
}

/** 구매자(request)가 상품 1건을 담아 주문하고 예치금으로 결제한다(장바구니는 먼저 비운다). 주문 id를 돌려준다. */
export async function placePaidOrder(buyer: APIRequestContext, inventoryId: number, quantity = 1): Promise<number> {
    await clearCart(buyer);
    await addToCart(buyer, inventoryId, quantity);
    const cart = await data(await buyer.get('/api/carts'), '장바구니 조회');
    const cartItemId = Number((cart.items ?? []).at(-1)?.cartItemId);
    if (!cartItemId) throw new Error(`장바구니 항목 id를 찾지 못했습니다: ${JSON.stringify(cart).slice(0, 300)}`);
    const order = await data(
        await buyer.post('/api/orders', {
            data: {
                cartItemIds: [cartItemId],
                deliveryAddress: { receiverName: 'e2e 수령인', receiverPhone: '010-9000-1234', zipCode: '06234', address: '서울특별시 강남구 테헤란로 123', addressDetail: '4층' },
            },
        }),
        '주문 생성',
    );
    const orderId = Number(order.orderId ?? order.id);
    if (!orderId) throw new Error(`주문 id를 찾지 못했습니다: ${JSON.stringify(order).slice(0, 300)}`);
    const pay = await buyer.post(`/api/orders/${orderId}/payment`, { data: {} });
    if (!pay.ok()) throw new Error(`예치금 결제 실패: ${pay.status()} ${(await pay.text()).slice(0, 300)}`);
    return orderId;
}

/** 결제 뒤 비동기(Kafka)로 만들어지는 배송 id를 기다려 돌려준다. */
export async function waitDeliveryId(buyer: APIRequestContext, orderId: number): Promise<number> {
    let id = 0;
    await expect
        .poll(
            async () => {
                const res = await buyer.get(`/api/deliveries/by-order?orderId=${orderId}&purchaseType=INDIVIDUAL_GROUP`);
                if (!res.ok()) return 0;
                const list = ((await res.json()) as { data?: { deliveryId?: number }[] }).data ?? [];
                id = Number(list[0]?.deliveryId ?? 0);
                return id;
            },
            { message: `주문 ${orderId}의 배송이 생성되지 않았습니다`, timeout: 60_000 },
        )
        .toBeGreaterThan(0);
    return id;
}

/** 판매자(request)가 송장을 등록하고 출고한다(API). */
export async function readyAndShip(seller: APIRequestContext, deliveryId: number): Promise<void> {
    const ready = await seller.patch(`/api/deliveries/${deliveryId}/ready`, { data: { carrier: 'CJ대한통운', trackingNumber: `E2E${deliveryId}${Date.now() % 100000}` } });
    if (!ready.ok()) throw new Error(`송장 등록 실패: ${ready.status()} ${(await ready.text()).slice(0, 300)}`);
    const ship = await seller.patch(`/api/deliveries/${deliveryId}/ship`);
    if (!ship.ok()) throw new Error(`출고 실패: ${ship.status()} ${(await ship.text()).slice(0, 300)}`);
}

/** 배송 상태(API). */
export async function deliveryStatusOf(request: APIRequestContext, deliveryId: number): Promise<string> {
    const d = await data(await request.get(`/api/deliveries/${deliveryId}`), '배송 조회');
    return String(d.status);
}

/** 배송들이 자동으로 배송 완료가 될 때까지 기다린다(환경에서 10초로 줄여 둠, 스케줄러 주기 10초). */
export async function waitDeliveredAll(request: APIRequestContext, deliveryIds: number[], timeout = 90_000): Promise<void> {
    for (const deliveryId of deliveryIds) {
        await expect.poll(() => deliveryStatusOf(request, deliveryId), { message: `배송 ${deliveryId}가 배송 완료로 바뀌지 않았습니다`, timeout, intervals: [2_000] }).toBe('DELIVERED');
    }
}

/** 구매자가 구매 확정(API). */
export async function confirmDeliveryApi(buyer: APIRequestContext, deliveryId: number): Promise<void> {
    const res = await buyer.patch(`/api/deliveries/${deliveryId}/confirm`);
    if (!res.ok()) throw new Error(`구매 확정 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
}

/** 판매자 쪽 목록의 전체 건수(대시보드 숫자와 맞춰 볼 때). */
export async function sellerDeliveryCount(seller: APIRequestContext, status: string): Promise<number> {
    const r = await data(await seller.get(`/api/deliveries/seller?status=${status}&page=0&size=1`), '판매자 배송 목록');
    return Number(r.totalElements ?? 0);
}

export async function sellerClaimCount(seller: APIRequestContext, status: string, claimType?: string): Promise<number> {
    const qs = `status=${status}${claimType ? `&claimType=${claimType}` : ''}&page=0&size=1`;
    const r = await data(await seller.get(`/api/claims/seller?${qs}`), '판매자 클레임 목록');
    return Number(r.totalElements ?? 0);
}

/**
 * 판매자 목록 화면에서 특정 상품이 몇 번째 쪽(1부터)에 있는지 API로 찾는다. 고정 판매자 계정에는 다른 흐름이 만든 배송 · 클레임이 쌓여 20건 쪽에 안 보일 수 있다.
 * url은 `/api/deliveries/seller?status=X` 같은 쿼리까지 포함한 주소, size는 화면과 같은 20.
 */
export async function pageOfProduct(seller: APIRequestContext, url: string, productName: string, size = 20): Promise<number> {
    for (let page = 0; page < 50; page++) {
        const r = await data(await seller.get(`${url}${url.includes('?') ? '&' : '?'}page=${page}&size=${size}`), '목록 조회');
        const rows: { items?: { productName?: string }[] }[] = r.content ?? [];
        if (rows.some((row) => (row.items ?? []).some((item) => item.productName === productName))) return page + 1;
        if (page + 1 >= Number(r.totalPages ?? 0)) break;
    }
    throw new Error(`목록에서 상품 "${productName}"을 찾지 못했습니다: ${url}`);
}
