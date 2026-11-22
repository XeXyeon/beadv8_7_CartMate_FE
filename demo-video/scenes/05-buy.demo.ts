import { expect, test } from '@playwright/test';
import { saveAuthState, trustedDeviceOnlyState } from '../../e2e/support/auth';
import { ACCOUNTS, authFile, resolvePassword } from '../../e2e/support/config.mjs';
import { clearCart, fillDelivery, submitOrderForm, walletBalance, won } from '../../e2e/support/shop';
import { setWalletBalance } from '../../e2e/support/wallet';
import { cancelPendingOrders, demoPost, newScene, saveOrders } from '../support/shared';

// E03 장바구니 → 주문서 → 예치금 결제, E04 비로그인 바로 구매 → 로그인 → 주문서 복원 → 결제.
const BALANCE = 300_000;

test('장면 05 구매 (E03 · E04)', async ({ browser, baseURL, playwright }) => {
    const post = demoPost();
    await setWalletBalance('buyer1', BALANCE);
    const api = await playwright.request.newContext({ baseURL, storageState: authFile('buyer1') });
    await cancelPendingOrders(api);
    await clearCart(api);
    const s = newScene(5, 'E03·E04', '구매: 장바구니 · 바로 구매', browser, baseURL);
    try {
        const n = await s.open({ storageState: authFile('buyer1') });
        const page = n.page;
        await n.beat('이번에는 구매자 입장입니다. 검색창에 상품 이름을 입력하면, 방금 등록한 판매글이 검색됩니다.', async () => {
            await page.goto('/');
            await page.getByPlaceholder('상품명으로 검색').click();
            await page.getByPlaceholder('상품명으로 검색').pressSequentially('러닝 쿨링 양말', { delay: 70 });
            await page.keyboard.press('Enter');
            await expect(page.getByText(post.title).first()).toBeVisible({ timeout: 30_000 });
        });
        await n.beat('상품 상세에서 가격과 재고를 확인하고, 장바구니에 담습니다.', async () => {
            await page.getByText(post.title).first().click();
            await expect(page).toHaveURL(/\/products\/\d+/);
            await page.waitForTimeout(1500); // 화면이 살아난 뒤에 누른다
            await page.getByRole('button', { name: '장바구니 담기' }).click();
            await expect(page.getByText('장바구니에 담았습니다.')).toBeVisible({ timeout: 20_000 });
        });
        await n.beat('장바구니에서 담긴 상품을 확인하고 주문하기로 넘어갑니다. 수량 변경과 삭제, 일부 상품만 주문하는 것도 여기서 할 수 있습니다.', async () => {
            await page.goto('/cart');
            await expect(page.getByRole('heading', { name: post.name })).toBeVisible();
            await page.getByRole('link', { name: /주문하기 \(1건\)/ }).click();
            await expect(page).toHaveURL(/\/checkout\?items=/);
        });
        let orderId = 0;
        await n.beat('주문서에서 배송지를 입력하고 주문 내용을 확인한 뒤 주문을 접수합니다.', async () => {
            await fillDelivery(page, '김시연');
            orderId = await submitOrderForm(page);
        });
        await n.beat('결제는 충전해 둔 예치금으로 합니다. 결제 후 남는 잔액을 미리 보여 주고, 결제하면 바로 완료됩니다.', async () => {
            await expect(page.getByText(won(BALANCE - post.price))).toBeVisible();
            await page.getByRole('button', { name: `${won(post.price)} 예치금으로 결제하기` }).click();
            await expect(page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(page.request)).toBe(BALANCE - post.price);
        });
        saveOrders({ e03: orderId });
        await n.close();

        // E04: 로그인 전 상태(신뢰 기기 쿠키만)에서 시작
        const m = await s.open({ storageState: trustedDeviceOnlyState('buyer1') });
        const p2 = m.page;
        let order2 = 0;
        try {
            await m.beat('로그인하지 않은 상태에서도 상품을 볼 수 있습니다. 수량을 고르고 바로 구매를 누르면 로그인 화면으로 이동합니다.', async () => {
                await p2.goto(`/products/${post.postId}`);
                await p2.getByRole('button', { name: '바로 구매' }).waitFor();
                await p2.waitForTimeout(1500); // 화면이 살아난 뒤에 누른다
                await p2.getByRole('button', { name: '수량 늘리기' }).click();
                await p2.getByRole('button', { name: '바로 구매' }).click();
                await expect(p2).toHaveURL(/\/login\?next=/);
            });
            await m.beat('로그인하면 방금 고른 상품과 수량 그대로 주문서가 복원됩니다. 이어서 같은 방법으로 결제합니다.', async () => {
                await p2.locator('#user-email').fill(ACCOUNTS.buyer1.email);
                await p2.locator('#user-password').fill(resolvePassword());
                await p2.getByRole('button', { name: '로그인', exact: true }).click();
                await expect(p2).toHaveURL(/\/checkout\?buyNow=\d+/, { timeout: 30_000 });
                await expect(p2.getByRole('listitem').filter({ hasText: post.name })).toContainText('수량: 2');
                await fillDelivery(p2, '김시연');
                order2 = await submitOrderForm(p2);
                await p2.getByRole('button', { name: `${won(post.price * 2)} 예치금으로 결제하기` }).click();
                await expect(p2.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            });
        } finally {
            await saveAuthState(m.context, 'buyer1'); // UI 로그인이 신뢰 기기 쿠키를 바꾼다
        }
        saveOrders({ e04: order2 });
        await m.close();
    } finally {
        await api.storageState({ path: authFile('buyer1') }).catch(() => {});
        await api.dispose();
        await s.save();
    }
});
