import { expect, test } from '@playwright/test';
import { authFile, saveAuthState, trustedDeviceOnlyState } from '../../support/auth';
import { ACCOUNTS, resolvePassword } from '../../support/config.mjs';
import { setWalletBalance } from '../../support/wallet';
import { addToCart, apiAs, cartCount, clearCart, createPost, fillDelivery, submitOrderForm, walletBalance, won } from '../../support/shop';

// QA-3 구매 흐름(E03 · E04 · E06 · E12 · E16). 판매글은 API로 준비하고, 구매 화면은 UI로 돈다.
// 잔액은 payment DB에 직접 맞춘다(토스 충전은 카드사 인증을 거쳐 자동화할 수 없다: e2e/flows/buy/account.spec.ts의 E02 참고).

const BALANCE = 300_000;

test.describe('구매자 e2e-buyer1', () => {
    test.use({ storageState: authFile('buyer1') });

    test('E03 장바구니 → 주문서 → 예치금 결제', async ({ page, request, playwright, baseURL }) => {
        const seller = await apiAs(playwright, baseURL, 'seller');
        const post = await createPost(seller, { name: 'E03 상품', price: 12_000 });
        await seller.dispose();
        await setWalletBalance('buyer1', BALANCE);
        await clearCart(request);

        // 상품 상세에서 장바구니 담기
        await page.goto(`/products/${post.postId}`);
        await page.waitForLoadState('networkidle'); // 개발 서버가 느리면 화면이 살아나기 전에 눌러 버린다
        await page.getByRole('button', { name: '장바구니 담기' }).click();
        await expect(page.getByText('장바구니에 담았습니다.')).toBeVisible({ timeout: 20_000 });

        // 장바구니 → 주문서
        await page.goto('/cart');
        await expect(page.getByRole('heading', { name: post.productName })).toBeVisible();
        await page.getByRole('link', { name: /주문하기 \(1건\)/ }).click();
        await expect(page).toHaveURL(/\/checkout\?items=/);
        await fillDelivery(page);
        await submitOrderForm(page);

        // 예치금 결제: 결제 후 잔액 안내 → 결제 → 결제 완료
        await expect(page.getByText(won(BALANCE - 12_000))).toBeVisible();
        await page.getByRole('button', { name: `${won(12_000)} 예치금으로 결제하기` }).click();
        await expect(page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
        await expect(page.getByText('팀바이 예치금')).toBeVisible();

        expect(await walletBalance(request)).toBe(BALANCE - 12_000);
        // 장바구니 정리는 결제 뒤 비동기(Kafka)로 끝날 수 있어 잠시 기다린다
        await expect.poll(() => cartCount(request), { timeout: 20_000 }).toBe(0);
    });

    test('E06 잔액 부족이면 결제할 수 없고 주문은 결제 대기로 남는다', async ({ page, request, playwright, baseURL }) => {
        const seller = await apiAs(playwright, baseURL, 'seller');
        const post = await createPost(seller, { name: 'E06 상품', price: 50_000 });
        await seller.dispose();
        await setWalletBalance('buyer1', 10_000);
        await clearCart(request);

        await page.goto(`/products/${post.postId}`);
        await page.getByRole('button', { name: '바로 구매' }).click();
        await expect(page).toHaveURL(/\/checkout\?items=/);
        // 주문서에서도 부족 금액을 알려 준다
        await expect(page.getByText(`예치금이 ${won(40_000)} 부족합니다`)).toBeVisible();
        await fillDelivery(page);
        const orderId = await submitOrderForm(page);

        await expect(page.getByText(`예치금이 ${won(40_000)} 부족합니다.`)).toBeVisible();
        await expect(page.getByRole('link', { name: '예치금 충전하기' })).toBeVisible();
        await expect(page.getByRole('button', { name: /예치금으로 결제하기/ })).toBeDisabled();

        // 주문은 결제 대기, 잔액은 그대로
        await page.goto(`/mypage/orders/${orderId}`);
        await expect(page.getByText('결제 대기').first()).toBeVisible();
        expect(await walletBalance(request)).toBe(10_000);
    });

    test('E12 결제 대기 주문을 취소한다', async ({ page, request, playwright, baseURL }) => {
        const seller = await apiAs(playwright, baseURL, 'seller');
        const post = await createPost(seller, { name: 'E12 상품', price: 8_000 });
        await seller.dispose();
        await setWalletBalance('buyer1', BALANCE);
        await clearCart(request);

        await page.goto(`/products/${post.postId}`);
        await page.getByRole('button', { name: '바로 구매' }).click();
        await fillDelivery(page);
        const orderId = await submitOrderForm(page);

        await page.goto(`/mypage/orders/${orderId}`);
        await expect(page.getByText('결제 대기').first()).toBeVisible();
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: '주문 취소' }).click();
        await expect(page.getByText(/취소된 주문입니다/)).toBeVisible();

        // 취소 상태 · 결제 화면에서도 취소로 보이고 잔액은 그대로
        await page.goto(`/checkout?order=${orderId}`);
        await expect(page.getByRole('heading', { name: '취소된 주문입니다' })).toBeVisible();
        expect(await walletBalance(request)).toBe(BALANCE);
    });

    test('E16 장바구니 편집: 수량 · 삭제 · 일부만 주문', async ({ page, request, playwright, baseURL }) => {
        const seller = await apiAs(playwright, baseURL, 'seller');
        const [a, b, c] = [
            await createPost(seller, { name: 'E16 상품A', price: 5_000 }),
            await createPost(seller, { name: 'E16 상품B', price: 7_000 }),
            await createPost(seller, { name: 'E16 상품C', price: 9_000 }),
        ];
        await seller.dispose();
        await clearCart(request);
        for (const p of [a, b, c]) await addToCart(request, p.inventoryId, 1);

        await page.goto('/cart');
        await expect(page.getByRole('heading', { name: a.productName })).toBeVisible();
        await expect(page.getByText('전체 선택 (3/3건)')).toBeVisible();

        // 수량 늘리기: 행 금액이 단가 × 수량으로 바뀐다
        await page.getByRole('button', { name: `${a.productName} 수량 늘리기` }).click();
        await expect(page.getByRole('article').filter({ hasText: a.productName })).toContainText(won(10_000));
        // 한 항목 삭제(B)
        await page.getByRole('button', { name: `${b.productName} 삭제` }).click();
        await expect(page.getByRole('heading', { name: b.productName })).toHaveCount(0);
        await expect(page.getByText('전체 선택 (2/2건)')).toBeVisible();

        // C는 선택 해제하고 A만 주문
        await page.getByRole('checkbox', { name: `${c.productName} 선택` }).uncheck();
        await expect(page.getByText('전체 선택 (1/2건)')).toBeVisible();
        await page.getByRole('link', { name: /주문하기 \(1건\)/ }).click();
        await expect(page).toHaveURL(/\/checkout\?items=\d+$/);
        // 주문서의 주문 상품 목록(li)만 본다. 캐시로 남은 장바구니 화면이 숨겨진 채 DOM에 있을 수 있다.
        const lines = page.getByRole('listitem');
        await expect(lines.filter({ hasText: a.productName })).toContainText('수량: 2');
        await expect(lines.filter({ hasText: c.productName })).toHaveCount(0);

        // C는 장바구니에 그대로 남아 있다
        await page.goto('/cart');
        await expect(page.getByRole('heading', { name: c.productName })).toBeVisible();
        expect(await cartCount(request)).toBe(2);

        // 선택 삭제: 남은 둘을 모두 선택해 지운다
        await page.getByRole('checkbox', { name: `${c.productName} 선택` }).check();
        await page.getByRole('button', { name: '선택 삭제' }).click();
        await expect(page.getByRole('heading', { name: '장바구니가 비어 있습니다.' })).toBeVisible();
    });
});

test.describe('로그인 전 바로 구매', () => {
    // 로그인 전 상태에서 시작한다(신뢰 기기 쿠키만 있어 메일 2차 인증은 건너뛴다)
    test.use({ storageState: trustedDeviceOnlyState('buyer1') });

    test('E04 비로그인 바로 구매 → 로그인 → 주문서 복원 → 결제', async ({ page, context, request, playwright, baseURL }) => {
        const seller = await apiAs(playwright, baseURL, 'seller');
        const post = await createPost(seller, { name: 'E04 상품', price: 6_000, stock: 20 });
        await seller.dispose();
        await setWalletBalance('buyer1', BALANCE);
        try {
            // 비로그인 상태로 수량 2를 골라 바로 구매 → 로그인 화면(돌아올 주소에 의도가 실린다)
            await page.goto(`/products/${post.postId}`);
            await page.getByRole('button', { name: '수량 늘리기' }).click();
            await page.getByRole('button', { name: '바로 구매' }).click();
            await expect(page).toHaveURL(/\/login\?next=/);

            await page.locator('#user-email').fill(ACCOUNTS.buyer1.email);
            await page.locator('#user-password').fill(resolvePassword());
            await page.getByRole('button', { name: '로그인', exact: true }).click();

            // 로그인 뒤 같은 상품 · 수량으로 주문서가 복원된다
            await expect(page).toHaveURL(/\/checkout\?items=\d+/, { timeout: 30_000 });
            await expect(page.getByRole('listitem').filter({ hasText: post.productName })).toContainText('수량: 2');
            await fillDelivery(page);
            await submitOrderForm(page);
            await page.getByRole('button', { name: `${won(12_000)} 예치금으로 결제하기` }).click();
            await expect(page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(page.request)).toBe(BALANCE - 12_000);
        } finally {
            // UI 로그인이 신뢰 기기 쿠키를 회전시켰다. 옛 쿠키는 못 쓰므로 새 쿠키를 저장해 둔다.
            await saveAuthState(context, 'buyer1');
        }
        void request;
    });
});
