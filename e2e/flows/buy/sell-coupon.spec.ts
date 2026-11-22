import { expect, test } from '@playwright/test';
import { authFile } from '../../support/auth';
import { withRunId } from '../../support/run';
import { setWalletBalance } from '../../support/wallet';
import { apiAs, clearCart, createPost, fillDelivery, submitOrderForm, walletBalance, won } from '../../support/shop';

// QA-3 판매글 등록(E05) · 쿠폰(E07).

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('E05 판매글 등록 → 상세 · 검색 노출', () => {
    test.use({ storageState: authFile('seller') });

    test('UI로 판매글을 등록하면 내 목록 · 상세 · 검색에 보인다', async ({ page }) => {
        const name = withRunId('E05 등록상품');
        await page.goto('/seller/products/new');
        await page.locator('#sales-title').fill(name);
        await page.locator('#sales-category').selectOption({ index: 1 });
        await page.locator('#sales-product-name').fill(name);
        await page.locator('#sales-price').fill('23000');
        await page.getByLabel('상세 설명').fill('E05 상세 설명');
        await page.getByLabel('재고 수량').first().fill('30');
        await page.locator('#sales-images').setInputFiles({ name: 'e05.png', mimeType: 'image/png', buffer: PNG });
        await page.getByRole('button', { name: '저장 및 등록 완료' }).click();

        // 등록 뒤 내 판매글 목록으로 간다
        await expect(page).toHaveURL(/\/seller\/products$/);
        const row = page.getByRole('row').filter({ hasText: name });
        await expect(row).toBeVisible();

        // 상세
        await row.getByRole('link', { name: '보기' }).click();
        await expect(page).toHaveURL(/\/products\/\d+/);
        await expect(page.getByRole('heading', { name }).first()).toBeVisible();
        await expect(page.getByText(won(23_000)).first()).toBeVisible();

        // 검색(색인은 비동기라 나타날 때까지 다시 조회한다)
        await expect(async () => {
            await page.goto(`/search?q=${encodeURIComponent(name)}`);
            await expect(page.getByText(name).first()).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 60_000, intervals: [2_000] });
    });
});

test.describe('E07 쿠폰 발급 · 사용', () => {
    test('관리자가 만든 쿠폰을 구매자가 받아 주문에 쓴다', async ({ browser, playwright, baseURL }) => {
        const couponName = withRunId('E07 3천원 쿠폰');

        // 1) 관리자: 쿠폰 만들기
        const adminCtx = await browser.newContext({ storageState: authFile('admin') });
        const admin = await adminCtx.newPage();
        await admin.goto('/admin/coupons');
        await admin.getByRole('button', { name: '새 쿠폰 만들기' }).click();
        await admin.getByLabel('쿠폰 이름').fill(couponName);
        await admin.getByLabel('할인 금액 (원)').fill('3000');
        // 만들기 전에 요약을 확인하는 대화상자가 뜬다
        admin.once('dialog', (d) => d.accept());
        await admin.getByRole('button', { name: '쿠폰 만들기', exact: true }).click();
        // 목록은 20개씩 끊겨 새 쿠폰이 첫 쪽에 없을 수 있다. 만들어졌는지는 폼이 닫히는 것과 구매자 쿠폰함에 뜨는 것으로 본다
        await expect(admin.getByRole('heading', { name: '새 쿠폰 만들기' })).toBeHidden();
        await adminCtx.close();

        // 2) 구매자: 쿠폰함에서 받기
        const buyerCtx = await browser.newContext({ storageState: authFile('buyer1') });
        const page = await buyerCtx.newPage();
        const buyerApi = await apiAs(playwright, baseURL, 'buyer1');
        const seller = await apiAs(playwright, baseURL, 'seller');
        const post = await createPost(seller, { name: 'E07 상품', price: 20_000 });
        await seller.dispose();
        await setWalletBalance('buyer1', 100_000);
        await clearCart(buyerApi);

        await page.goto('/mypage/coupons');
        const card = page.locator('div').filter({ hasText: couponName }).filter({ has: page.getByRole('button', { name: '받기' }) }).last();
        await card.getByRole('button', { name: '받기' }).click();
        await expect(page.getByRole('button', { name: '받음' }).first()).toBeVisible();

        // 3) 주문서에서 쿠폰 선택 → 결제 금액이 할인된다
        await page.goto(`/products/${post.postId}`);
        await page.getByRole('button', { name: '바로 구매' }).click();
        await expect(page).toHaveURL(/\/checkout\?buyNow=/);
        await fillDelivery(page);
        await submitOrderForm(page);

        const group = page.getByRole('radiogroup', { name: '쓸 쿠폰' });
        await group.getByRole('radio').nth(1).check();
        await expect(page.getByText('쿠폰 할인')).toBeVisible();
        await expect(page.getByText(`-${won(3_000)}`).first()).toBeVisible();
        await page.getByRole('button', { name: `${won(17_000)} 예치금으로 결제하기` }).click();
        await expect(page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
        expect(await walletBalance(buyerApi)).toBe(100_000 - 17_000);

        // 4) 쿠폰함: 쓴 쿠폰은 "사용·만료" 탭으로 간다
        await page.goto('/mypage/coupons');
        await page.getByRole('tab', { name: /^사용·만료/ }).click();
        await expect(page.getByText(couponName).first()).toBeVisible();

        await buyerApi.dispose();
        await buyerCtx.close();
    });
});
