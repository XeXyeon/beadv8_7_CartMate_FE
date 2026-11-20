import { expect, test } from '@playwright/test';
import { authFile } from '../../e2e/support/config.mjs';
import { confirmDeliveryApi, readyAndShip, waitDeliveredAll, waitDeliveryId } from '../../e2e/support/ship';
import { SELLER_STATE, newScene, orders, saveOrders, sellerApi } from '../support/shared';

// E08 결제 → 판매자 송장 · 출고 → 배송 완료(자동) → 구매 확정. 장면 5에서 결제한 주문을 쓴다.
// 다음 장면(환불 · 교환)에 쓸 두 주문은 화면 밖에서 먼저 출고해 둔다(배송 완료까지 시간이 걸려서).
test('장면 09 배송과 구매 확정 (E08)', async ({ browser, baseURL, playwright }) => {
    const o = orders();
    if (!o.e03 || !o.e04 || !o.e07) throw new Error('work/orders.json에 장면 5 · 6의 주문이 없습니다.');
    const seller = await sellerApi(playwright, baseURL);
    const buyer = await playwright.request.newContext({ baseURL, storageState: authFile('buyer1') });
    let deliveryId = 0;
    try {
        deliveryId = await waitDeliveryId(buyer, o.e03);
        const d04 = await waitDeliveryId(buyer, o.e04);
        const d07 = await waitDeliveryId(buyer, o.e07);
        await readyAndShip(seller, d04);
        await readyAndShip(seller, d07);
        // 이전에 일부만 돌린 장면이 남긴 배송 요청이 있으면 먼저 출고해, 화면의 배송 요청 목록에 이번 주문만 남긴다
        const left = await seller.get('/api/deliveries/seller?status=REQUESTED&page=0&size=50');
        for (const d of ((await left.json()).data?.content ?? []) as { deliveryId?: number; id?: number }[]) {
            const did = Number(d.deliveryId ?? d.id);
            if (did && did !== deliveryId) await readyAndShip(seller, did);
        }
        saveOrders({ e08Delivery: deliveryId, e09Delivery: d04, e20Delivery: d07 });
    } finally {
        await seller.storageState({ path: SELLER_STATE }).catch(() => {});
        await buyer.storageState({ path: authFile('buyer1') }).catch(() => {});
        await seller.dispose();
        await buyer.dispose();
    }

    const s = newScene(9, 'E08', '배송과 구매 확정', browser, baseURL);
    const status = (page: import('@playwright/test').Page) => page.locator('[data-delivery-status]').first();
    try {
        const a = await s.open({ storageState: authFile('buyer1') });
        await a.beat('결제가 끝난 주문은 곧바로 판매자에게 배송 요청으로 전달됩니다. 구매자의 주문 상세에서도 배송 요청 상태를 확인할 수 있습니다.', async () => {
            await a.page.goto(`/mypage/orders/${o.e03}`);
            await expect(status(a.page)).toHaveAttribute('data-delivery-status', 'REQUESTED');
        });
        await a.close();

        const sp = await s.open({ storageState: SELLER_STATE });
        await sp.beat('판매자 센터의 대시보드에는 처리할 배송과 클레임 건수가 모여 있습니다. 배송 관리로 들어가 보겠습니다.', async () => {
            await sp.page.goto('/seller');
            await expect(sp.page.getByText('배송 요청 건수').first()).toBeVisible();
            await sp.page.goto('/seller/shipping?status=REQUESTED');
            await expect(sp.page.locator('tr').filter({ hasText: '러닝 쿨링 양말' })).toHaveCount(1);
        });
        await sp.beat('택배사를 고르고 송장번호를 입력해 등록하면, 배송 준비 상태로 넘어갑니다.', async () => {
            const row = sp.page.locator('tr', { hasText: '러닝 쿨링 양말' });
            await row.getByRole('combobox').selectOption('CJ대한통운');
            await row.getByPlaceholder('송장번호 입력').pressSequentially(`66${Date.now() % 100000000}`, { delay: 50 });
            await row.getByRole('button', { name: '등록', exact: true }).click();
            await expect(sp.page.locator('tr', { hasText: '러닝 쿨링 양말' })).toHaveCount(0);
        });
        await sp.beat('배송 준비 탭에서 출고를 누르면 배송 중으로 바뀝니다.', async () => {
            await sp.page.goto('/seller/shipping?status=PREPARING');
            const row = sp.page.locator('tr', { hasText: '러닝 쿨링 양말' }).first();
            await expect(row.getByText('배송준비')).toBeVisible();
            await row.getByRole('button', { name: '출고', exact: true }).click();
            await expect(sp.page.locator('tr', { hasText: '러닝 쿨링 양말' })).toHaveCount(0);
            await sp.page.goto('/seller/shipping?status=SHIPPING');
            await expect(sp.page.locator('tr', { hasText: '러닝 쿨링 양말' }).first().getByText('배송중')).toBeVisible();
        });
        await sp.close();

        const b = await s.open({ storageState: authFile('buyer1') });
        await b.beat('구매자의 주문 상세에서는 배송이 진행되는 모습이 실시간으로 반영됩니다. 시연 환경에서는 배송 완료가 몇 초 만에 자동으로 처리됩니다.', async () => {
            await b.page.goto(`/mypage/orders/${o.e03}`);
            await expect(status(b.page)).toHaveAttribute('data-delivery-status', /SHIPPING|DELIVERED/);
            await waitDeliveredAll(b.context.request, [deliveryId]);
            await b.page.reload();
            await expect(status(b.page)).toHaveAttribute('data-delivery-status', 'DELIVERED');
        });
        await b.beat('상품을 받은 구매자가 구매 확정을 누르면 거래가 마무리되고, 이때부터 판매자에게 정산이 시작됩니다.', async () => {
            await b.page.getByRole('button', { name: '구매 확정', exact: true }).click();
            await b.page.getByRole('button', { name: '구매 확정하기' }).click();
            await expect(status(b.page)).toHaveAttribute('data-delivery-status', 'CONFIRMED');
            await expect(b.page.getByText('구매가 확정되었습니다.')).toBeVisible();
        });
        await b.close();
    } finally {
        await s.save();
    }
});
