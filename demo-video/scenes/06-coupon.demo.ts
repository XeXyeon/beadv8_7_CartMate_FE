import { expect, test } from '@playwright/test';
import { authFile } from '../../e2e/support/config.mjs';
import { clearCart, fillDelivery, submitOrderForm, walletBalance, won } from '../../e2e/support/shop';
import { setWalletBalance } from '../../e2e/support/wallet';
import { cancelPendingOrders, demoPost, newScene, saveOrders } from '../support/shared';

// E07 쿠폰: 관리자가 만들고 → 구매자가 받아 → 주문서에서 쓴다.
test('장면 06 쿠폰 (E07)', async ({ browser, baseURL, playwright }) => {
    const post = demoPost();
    const coupon = '시연 환영 쿠폰 3,000원';
    await setWalletBalance('buyer1', 100_000);
    const api = await playwright.request.newContext({ baseURL, storageState: authFile('buyer1') });
    await cancelPendingOrders(api);
    await clearCart(api);
    const s = newScene(6, 'E07', '쿠폰 발급 · 사용', browser, baseURL);
    try {
        const a = await s.open({ storageState: authFile('admin') });
        await a.beat('쿠폰은 관리자 화면에서 만듭니다. 쿠폰 이름과 할인 금액을 입력하고 만들기를 누릅니다.', async () => {
            await a.page.goto('/admin/coupons');
            await a.page.getByRole('button', { name: '새 쿠폰 만들기' }).click();
            await a.page.getByLabel('쿠폰 이름').pressSequentially(coupon, { delay: 35 });
            await a.page.getByLabel('할인 금액 (원)').fill('3000');
        });
        await a.beat('쿠폰이 만들어지면 구매자가 쿠폰함에서 받을 수 있습니다.', async () => {
            await a.page.getByRole('button', { name: '쿠폰 만들기', exact: true }).click();
            await expect(a.page.getByRole('heading', { name: '새 쿠폰 만들기' })).toBeHidden();
        });
        await a.close();

        const b = await s.open({ storageState: authFile('buyer1') });
        const page = b.page;
        await b.beat('구매자의 쿠폰함에 방금 만든 쿠폰이 보입니다. 받기를 누르면 내 쿠폰이 됩니다.', async () => {
            await page.goto('/mypage/coupons');
            const card = page.locator('div').filter({ hasText: coupon }).filter({ has: page.getByRole('button', { name: '받기' }) }).last();
            await card.getByRole('button', { name: '받기' }).click();
            await expect(page.getByRole('button', { name: '받음' }).first()).toBeVisible();
        });
        let orderId = 0;
        await b.beat('상품을 바로 구매하면, 주문서에서 쓸 쿠폰을 고를 수 있습니다.', async () => {
            await page.goto(`/products/${post.postId}`);
            await page.waitForTimeout(1500); // 화면이 살아난 뒤에 누른다
            await page.getByRole('button', { name: '바로 구매' }).click();
            await expect(page).toHaveURL(/\/checkout\?buyNow=/);
            await fillDelivery(page, '김시연');
            orderId = await submitOrderForm(page);
        });
        await b.beat('쿠폰을 고르면 쿠폰 할인이 바로 반영되어 결제 금액이 줄어듭니다. 할인된 금액으로 결제합니다.', async () => {
            await page.getByRole('radiogroup', { name: '쓸 쿠폰' }).getByRole('radio').nth(1).check();
            await expect(page.getByText('쿠폰 할인')).toBeVisible();
            await expect(page.getByText(`-${won(3_000)}`).first()).toBeVisible();
            await page.getByRole('button', { name: `${won(post.price - 3_000)} 예치금으로 결제하기` }).click();
            await expect(page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(page.request)).toBe(100_000 - (post.price - 3_000));
        });
        await b.beat('사용한 쿠폰은 쿠폰함의 사용 · 만료 탭으로 옮겨집니다.', async () => {
            await page.goto('/mypage/coupons');
            await page.getByRole('tab', { name: /^사용·만료/ }).click();
            await expect(page.getByText(coupon).first()).toBeVisible();
        });
        saveOrders({ e07: orderId });
        await b.close();
    } finally {
        await api.storageState({ path: authFile('buyer1') }).catch(() => {});
        await api.dispose();
        await s.save();
    }
});
