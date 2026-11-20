import { expect, test } from '@playwright/test';
import { authFile } from '../../e2e/support/config.mjs';
import { walletBalance } from '../../e2e/support/shop';
import { waitDeliveredAll } from '../../e2e/support/ship';
import { SELLER_STATE, newScene, orders } from '../support/shared';
import { applyClaim, approveFirst, completeClaim } from '../support/ship-ui';

// E09 환불(반품) 신청 → 판매자 수락 → 환불 완료, E20 교환 신청 → 판매자 수락 → 완료.
test('장면 10 환불과 교환 (E09 · E20)', async ({ browser, baseURL, playwright }) => {
    const o = orders();
    if (!o.e09Delivery || !o.e20Delivery) throw new Error('장면 9를 먼저 돌리세요.');
    const buyerApi = await playwright.request.newContext({ baseURL, storageState: authFile('buyer1') });
    await waitDeliveredAll(buyerApi, [o.e09Delivery, o.e20Delivery]);
    const refundOrder = o.e04!;
    const exchangeOrder = o.e07!;
    const before = await walletBalance(buyerApi);
    await buyerApi.storageState({ path: authFile('buyer1') }).catch(() => {});
    await buyerApi.dispose();

    // 영상 길이(10분 이내) 때문에 교환(E20)은 기본 제외. DEMO_EXTRAS=1이면 함께 녹화한다.
    const withExchange = process.env.DEMO_EXTRAS === '1';
    const s = newScene(10, withExchange ? 'E09·E20' : 'E09', withExchange ? '환불과 교환' : '환불', browser, baseURL);
    try {
        const a = await s.open({ storageState: authFile('buyer1') });
        await a.beat('배송이 완료된 주문은 주문 상세에서 반품이나 교환을 신청할 수 있습니다. 단순 변심으로 반품, 즉 환불을 신청합니다. 신청하면 클레임 내역에 접수 상태로 나타납니다.', async () => {
            await applyClaim(a.page, refundOrder, '반품', 'SIMPLE_CHANGE');
        });
        if (withExchange) {
            await a.beat('다른 주문은 사이즈가 맞지 않아 교환을 신청합니다.', async () => {
                await applyClaim(a.page, exchangeOrder, '교환', 'SIZE_MISMATCH');
            });
        }
        await a.close();

        const sp = await s.open({ storageState: SELLER_STATE });
        await sp.beat('판매자는 클레임 관리에서 접수된 요청을 검토하고 승인하거나 거절할 수 있습니다. 여기서는 승인합니다.', async () => {
            await approveFirst(sp.page);
            if (withExchange) await approveFirst(sp.page);
        });
        await sp.beat('환불이 승인되면 결제 금액이 예치금으로 돌아가는 처리가 자동으로 진행되고, 끝나면 반품 완료를 누를 수 있습니다.', async () => {
            await completeClaim(sp.page, '반품 완료');
            if (withExchange) await completeClaim(sp.page, '교환 완료');
            await sp.page.goto('/seller/claims?tab=done');
            await expect(sp.page.getByText('완료', { exact: true }).first()).toBeVisible();
        });
        await sp.close();

        const b = await s.open({ storageState: authFile('buyer1') });
        await b.beat('구매자의 클레임 내역에는 반품 완료와 예치금 환불 완료가 표시되고, 환불된 금액은 예치금 잔액에 그대로 반영됩니다.', async () => {
            await b.page.goto('/mypage/claims');
            await expect(b.page.getByText('예치금 환불 완료').first()).toBeVisible({ timeout: 60_000 });
            await b.page.goto('/mypage/deposit');
            expect(await walletBalance(b.context.request)).toBe(before + 46_000);
        });
        await b.close();
    } finally {
        await s.save();
    }
});
