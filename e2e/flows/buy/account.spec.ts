import { expect, test } from '@playwright/test';
import { authFile } from '../../support/auth';
import { setWalletBalance } from '../../support/wallet';
import { apiAs, clearCart, createPost, walletBalance, won } from '../../support/shop';
import { withRunId } from '../../support/run';
import { ACCOUNTS } from '../../support/config.mjs';
import { waitForMailCode } from '../../support/codes';

// QA-3 계정 · 지갑 흐름(E01 · E02 · E15 · E18 · E19).

test.describe('E01 접근 제어', () => {
    test.describe('비로그인', () => {
        for (const path of ['/cart', '/mypage', '/mypage/orders', '/checkout', '/seller', '/admin']) {
            test(`${path} → 로그인 화면`, async ({ page }) => {
                await page.goto(path);
                await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[%]/g, '\\%')}`));
                await expect(page.locator('#user-email')).toBeVisible();
            });
        }
    });

    test.describe('구매자', () => {
        test.use({ storageState: authFile('buyer1') });
        test('/admin은 홈으로, /seller는 판매자 신청으로 보낸다', async ({ page }) => {
            await page.goto('/admin');
            await expect(page).toHaveURL(/\/$/);
            await page.goto('/seller');
            await expect(page).toHaveURL(/\/mypage\/seller-apply/);
            await page.goto('/cart');
            await expect(page).toHaveURL(/\/cart$/);
        });
    });

    test.describe('판매자', () => {
        test.use({ storageState: authFile('seller') });
        test('/seller는 열리고 /admin은 막힌다', async ({ page }) => {
            await page.goto('/seller');
            await expect(page).toHaveURL(/\/seller$/);
            await page.goto('/admin');
            await expect(page).toHaveURL(/\/$/);
        });
    });
});

test.describe('E02 예치금 충전', () => {
    test.use({ storageState: authFile('buyer1') });

    test('결제창이 열리고 충전 금액 · 상품명이 보인다(토스 테스트 키)', async ({ page }) => {
        await page.goto('/mypage/deposit/charge');
        await page.getByRole('button', { name: '50,000원' }).click();
        await page.getByRole('button', { name: '결제하기' }).click();
        // 토스 결제창은 iframe(payment-gateway-sandbox.tosspayments.com)으로 뜬다
        await expect.poll(() => page.frames().some((f) => f.url().includes('tosspayments.com')), { timeout: 20_000 }).toBe(true);
        const toss = page.frames().find((f) => f.url().includes('tosspayments.com'))!;
        await expect(toss.getByText('예치금 충전').first()).toBeVisible();
        await expect(toss.getByText('50,000원').first()).toBeVisible();
    });

    // 카드사 본인인증 화면은 자동화할 수 없어, 결제창이 열리는 것까지만 실제 토스를 보고
    // 그 뒤(승인)는 토스 성공 주소로 바로 이동하고 BE가 부르는 토스를 compose의 가짜 토스(e2e/infra/toss-stub)로 돌린다.
    test('E02 토스 결제 완료 → 잔액 · 거래내역 CHARGE', async ({ page, request }) => {
        const before = await walletBalance(request);
        await page.goto('/mypage/deposit/charge');
        await page.getByRole('button', { name: '50,000원' }).click();
        const ordered = page.waitForResponse((r) => r.url().endsWith('/api/wallets/me/charges') && r.request().method() === 'POST');
        await page.getByRole('button', { name: '결제하기' }).click();
        const orderNumber = (await (await ordered).json()).data.orderNumber as string;
        expect(orderNumber).toBeTruthy();
        await expect.poll(() => page.frames().some((f) => f.url().includes('tosspayments.com')), { timeout: 20_000 }).toBe(true);

        // 카드사 인증을 마친 것처럼 토스가 돌려보내는 주소로 이동한다(가짜 paymentKey)
        const paymentKey = `e2e_${Date.now()}${Math.floor(Math.random() * 1000)}`;
        await page.goto(`/mypage/deposit/charge/success?paymentKey=${paymentKey}&orderId=${orderNumber}&amount=50000`);
        await expect(page.getByRole('heading', { name: '충전이 완료되었습니다' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(`${won(50_000)}을 충전했습니다.`).first()).toBeVisible();
        expect(await walletBalance(request)).toBe(before + 50_000);

        // 새로고침해도 같은 결제는 중복 충전되지 않는다
        await page.reload();
        await expect(page.getByRole('heading', { name: '충전이 완료되었습니다' })).toBeVisible({ timeout: 30_000 });
        expect(await walletBalance(request)).toBe(before + 50_000);

        // 거래내역에 충전(CHARGE)이 보인다
        await page.goto('/mypage/deposit/history');
        await expect(page.getByRole('row').filter({ hasText: '예치금 충전' }).filter({ hasText: '+50,000원' }).first()).toBeVisible();
    });
});

test.describe('E15 세션 만료 · 로그아웃', () => {
    test.use({ storageState: authFile('target') });

    test('만료된 세션은 ?expired=1 안내와 함께 로그인 화면으로 보낸다', async ({ page, context }) => {
        await page.goto('/mypage');
        await expect(page.getByText('e2e-target님')).toBeVisible();

        // 서명이 틀린 토큰(만료 시각은 그대로라 proxy는 통과)을 심고 재발급 토큰도 지워, API가 401을 받고 재발급도 실패하게 만든다
        const access = (await context.cookies()).find((c) => c.name === 'accessToken')!;
        const forged = access.value.slice(0, -4) + (access.value.endsWith('AAAA') ? 'BBBB' : 'AAAA');
        await context.clearCookies({ name: 'refreshToken' });
        await context.addCookies([{ ...access, value: forged }]);

        // 화면 안에서 이동해 다시 불러오게 한다(첫 로드는 로그인 안 한 상태와 구분되지 않아 만료 안내가 뜨지 않는다)
        await page.getByRole('link', { name: '주문/배송 조회' }).click();
        await expect(page).toHaveURL(/\/login\?expired=1/, { timeout: 30_000 });
        await expect(page.getByText('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.')).toBeVisible();
        // 이전 사용자 정보가 남지 않는다
        await expect(page.getByText('e2e-target님')).toHaveCount(0);
        await page.goto('/mypage');
        await expect(page).toHaveURL(/\/login\?next=%2Fmypage/);
    });
});

test.describe('E15 로그아웃', () => {
    test.use({ storageState: authFile('seller') });

    test('로그아웃하면 홈으로 가고 보호된 화면에 들어갈 수 없다', async ({ page, browser, baseURL }) => {
        // 이 테스트의 로그아웃이 서버의 재발급 토큰을 폐기하므로, 다른 테스트가 쓰는 판매자 세션과 겹치지 않게 별도 로그인 상태를 쓴다
        void browser;
        void baseURL;
        await page.goto('/');
        await expect(page.getByText('e2e-seller님')).toBeVisible();
        await page.getByRole('button', { name: '로그아웃' }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByText('e2e-seller님')).toHaveCount(0);
        await page.goto('/seller');
        await expect(page).toHaveURL(/\/login\?next=%2Fseller/);
    });
});

test.describe('구매자 e2e-buyer1 — 배송지', () => {
    test.use({ storageState: authFile('buyer1') });

    test('E18 배송지 추가 · 기본 변경 → 주문서 자동 채움', async ({ page, request, playwright, baseURL }) => {
        const seller = await apiAs(playwright, baseURL, 'seller');
        const post = await createPost(seller, { name: 'E18 상품', price: 4_000 });
        await seller.dispose();
        await clearCart(request);

        // 다음(카카오) 우편번호 서비스는 외부 팝업이라, 스크립트를 고정 주소를 돌려주는 가짜로 바꾼다
        await page.route('https://t1.daumcdn.net/**', (route) =>
            route.fulfill({
                contentType: 'text/javascript',
                body: `window.daum = { Postcode: function (o) { this.open = function () { o.oncomplete({ zonecode: '04524', roadAddress: '서울특별시 중구 세종대로 110', jibunAddress: '', buildingName: '' }); }; } };`,
            }),
        );
        const name = withRunId('E18 배송지');
        await page.goto('/mypage/addresses');
        const original = page.getByRole('listitem').filter({ has: page.getByText('기본', { exact: true }) });
        const originalName = (await original.locator('span.font-semibold').first().innerText()).trim();
        let created = false;
        try {
            await page.getByRole('button', { name: '새 배송지 추가' }).click();
            await page.locator('#input-name').fill(name);
            await page.locator('#input-recipient').fill('E18 수령인');
            await page.locator('#input-phone').fill('01090001818');
            await page.getByRole('button', { name: '우편번호 찾기' }).click();
            await expect(page.locator('#input-zipcode')).toHaveValue('04524');
            await page.locator('#input-address2').fill('18층');
            await page.locator('#input-default').check();
            await page.getByRole('button', { name: '저장하기' }).click();
            created = true;

            const row = page.getByRole('listitem').filter({ hasText: name });
            await expect(row).toContainText('기본');
            await expect(row).toContainText('[04524] 서울특별시 중구 세종대로 110, 18층');

            // 새 기본 배송지가 주문서에 자동으로 채워진다
            await page.goto(`/products/${post.postId}`);
            await page.getByRole('button', { name: '바로 구매' }).click();
            await expect(page).toHaveURL(/\/checkout\?items=/);
            await expect(page.getByLabel('우편번호')).toHaveValue('04524');
            await expect(page.getByLabel('주소', { exact: true })).toHaveValue('서울특별시 중구 세종대로 110');
            await expect(page.getByLabel('상세 주소 (선택)')).toHaveValue('18층');

            // 기존 배송지를 다시 기본으로 지정하면 주문서도 원래대로 채워진다
            await page.goto('/mypage/addresses');
            await page.getByRole('listitem').filter({ hasText: originalName }).getByRole('button', { name: '기본으로 지정' }).click();
            await expect(page.getByRole('listitem').filter({ hasText: originalName })).toContainText('기본');
        } finally {
            // 상태 복구: 원래 배송지를 기본으로 되돌리고 추가한 배송지를 지운다
            if (created) {
                await page.goto('/mypage/addresses');
                const orig = page.getByRole('listitem').filter({ hasText: originalName });
                if (await orig.getByRole('button', { name: '기본으로 지정' }).count()) await orig.getByRole('button', { name: '기본으로 지정' }).click();
                await expect(orig).toContainText('기본');
                page.once('dialog', (d) => d.accept());
                await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: '삭제' }).click();
                await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
            }
        }
    });
});

test.describe('판매자 e2e-seller — 출금', () => {
    test.use({ storageState: authFile('seller') });

    // FE 버그(이슈 QA-3#1): 출금 확정이 BE에 없는 엔드포인트를 불러 "출금 확정"에서 멈춘다. 고쳐지면 fixme를 푼다.
    test.fixme('E19 예치금 출금', async ({ page, request }) => {
        // 출금하려면 출금 계좌가 있어야 한다(없으면 "출금 계좌를 먼저 등록해주세요"). 그런데 FE에는 출금 계좌 등록 화면이 없어서(이슈 QA-3#1)
        // 준비 단계에서만 API로 등록한다(PUT /api/members/me/payout-account, 이메일 인증 필요). 이 단계는 멱등이다.
        // 이미 등록돼 있으면 건너뛴다(인증번호 재발송은 60초 · 30분에 5번으로 제한돼 있다)
        const mine = await request.get('/api/members/me/payout-account');
        if (!(await mine.json()).data) {
            // 이메일 인증번호(로그에서 읽는다) → 인증 → 출금 계좌 등록(국민은행, 가짜 계좌번호)
            const since = Date.now();
            const sent = await request.post('/api/members/me/payout-account/email-code');
            expect(sent.ok(), `인증번호 발송 ${sent.status()} ${await sent.text()}`).toBe(true);
            const code = await waitForMailCode(ACCOUNTS.seller.email, since);
            const verified = await request.post('/api/members/me/payout-account/email-code/verify', { data: { code } });
            expect(verified.ok(), `인증 ${verified.status()} ${await verified.text()}`).toBe(true);
            const registered = await request.put('/api/members/me/payout-account', { data: { bankName: '국민은행', accountHolder: 'e2e판매자', accountNumber: '1002000000001' } });
            expect(registered.ok(), `출금 계좌 등록 ${registered.status()} ${await registered.text()}`).toBe(true);
        }
        await setWalletBalance('seller', 100_000);
        await page.goto('/mypage/deposit/withdraw');
        await page.locator('#withdraw-amount').fill('30000');
        await page.getByRole('button', { name: '출금 요청' }).click();
        await page.getByRole('button', { name: '출금 확정' }).click();
        await expect(page.getByText('출금이 완료되었습니다')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(`${won(30_000)}을 출금했습니다.`)).toBeVisible();
        expect(await walletBalance(request)).toBe(70_000);

        // 거래내역에 출금(WITHDRAW) 항목이 보인다
        await page.goto('/mypage/deposit/history');
        const row = page.getByText('예치금 출금').first();
        await expect(row).toBeVisible();
        await expect(page.getByText('30,000').first()).toBeVisible();
    });
});
