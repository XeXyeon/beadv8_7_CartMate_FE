import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { authFile } from '../../support/auth';
import { currentPayoutCron, DEFAULT_PAYOUT_CRON, EVERY_MINUTE_PAYOUT_CRON, listPayouts, makePayoutsDue, payoutBatchRanToday, restartPaymentWithPayoutCron } from '../../support/payout';
import { runId } from '../../support/run';
import { apiAs, createPost, walletBalance } from '../../support/shop';
import {
    confirmDeliveryApi,
    deliveryStatusOf,
    pageOfProduct,
    placePaidOrder,
    readyAndShip,
    sellerClaimCount,
    sellerDeliveryCount,
    waitDeliveredAll,
    waitDeliveryId,
} from '../../support/ship';
import { setWalletBalance } from '../../support/wallet';

// QA-6 배송 · 클레임 · 정산 흐름(E08 · E09 · E20 · E21 · E23 · E30).
// 배송 자동 완료를 기다리는 흐름은 beforeAll에서 주문을 한꺼번에 만들고 출고시켜 대기를 한 번으로 묶는다(E08만 판매자 화면으로 직접 출고).
// 이 spec의 테스트는 앞 테스트가 만든 주문을 이어 쓰므로 serial로 돈다.

const PRICE = 20_000;
const BALANCE = 500_000;

test.describe.configure({ mode: 'serial' });

type Key = 'e08' | 'e09' | 'e20' | 'e21' | 'e23' | 'e30';
const names: Record<Key, string> = {
    e08: `E08 배송 상품 ${runId()}`,
    e09: `E09 환불 상품 ${runId()}`,
    e20: `E20 교환 상품 ${runId()}`,
    e21: `E21 확정 차단 상품 ${runId()}`,
    e23: `E23 대시보드 상품 ${runId()}`,
    e30: `E30 정산 상품 ${runId()}`,
};

let sellerApi: APIRequestContext;
let buyerApi: APIRequestContext;
const orders = {} as Record<Key, { orderId: number; deliveryId: number; inventoryId: number }>;

async function sellerPage(browser: Browser, baseURL: string | undefined) {
    const ctx = await browser.newContext({ baseURL, storageState: authFile('seller'), viewport: { width: 1280, height: 720 } });
    return { ctx, page: await ctx.newPage() };
}

test.beforeAll(async ({ playwright, baseURL }) => {
    test.setTimeout(300_000);
    sellerApi = await apiAs(playwright, baseURL, 'seller');
    buyerApi = await apiAs(playwright, baseURL, 'buyer1');
    await setWalletBalance('buyer1', BALANCE);

    // 판매글 · 주문 · 결제
    const keys = Object.keys(names) as Key[];
    for (const key of keys) {
        const post = await createPost(sellerApi, { name: names[key], price: PRICE });
        const orderId = await placePaidOrder(buyerApi, post.inventoryId);
        orders[key] = { orderId, deliveryId: 0, inventoryId: post.inventoryId };
    }
    for (const key of keys) orders[key].deliveryId = await waitDeliveryId(buyerApi, orders[key].orderId);

    // E08 · E23은 테스트 안에서 직접 다룬다. 나머지는 지금 출고시켜 배송 완료 대기를 한 번에 겹친다.
    const shipNow: Key[] = ['e09', 'e20', 'e21', 'e30'];
    for (const key of shipNow) await readyAndShip(sellerApi, orders[key].deliveryId);
});

// E30이 매분 cron으로 바꿨다면, 테스트가 타임아웃 · 중단되어도 기본 cron으로 되돌린다.
let cronToRestore: string | null = null;

test.afterAll(async () => {
    if (cronToRestore) {
        try {
            restartPaymentWithPayoutCron(cronToRestore);
        } catch (e) {
            console.error(`지급 cron 복원 실패(수동으로 E2E_PAYOUT_CRON 기본값으로 다시 띄우세요): ${(e as Error).message}`);
        }
    }
    await sellerApi?.dispose();
    await buyerApi?.dispose();
});

const statusOf = (page: Page) => page.locator('[data-delivery-status]').first();

/** 판매자 배송 관리에서 상품 행을 찾아 돌려준다(고정 계정에 쌓인 배송 때문에 20건 쪽을 넘을 수 있어 API로 쪽을 계산). */
/** 상태가 바뀐 직후에는 서버 목록에 아직 없을 수 있어 잠시 기다린다. */
async function pageOfEventually(url: string, productName: string): Promise<number> {
    let found = 0;
    await expect
        .poll(async () => (found = await pageOfProduct(sellerApi, url, productName).catch(() => 0)), { timeout: 30_000, intervals: [1_000], message: `${productName}이(가) 목록에 나타나지 않았습니다: ${url}` })
        .toBeGreaterThan(0);
    return found;
}

async function shippingRow(sp: Page, status: string, productName: string) {
    const pg = await pageOfEventually(`/api/deliveries/seller?status=${status}`, productName);
    await sp.goto(`/seller/shipping?status=${status}${pg > 1 ? `&page=${pg}` : ''}`);
    const row = sp.locator('tr', { hasText: productName });
    await expect(row).toHaveCount(1);
    return row;
}

async function claimRow(sp: Page, tab: 'pending' | 'progress' | 'done', productName: string) {
    const statuses = { pending: 'status=REQUESTED', progress: 'status=APPROVED', done: 'status=COMPLETED&status=REJECTED' }[tab];
    const pg = await pageOfEventually(`/api/claims/seller?${statuses}`, productName);
    await sp.goto(`/seller/claims?tab=${tab}${pg > 1 ? `&page=${pg}` : ''}`);
    const row = sp.locator('tr', { hasText: productName });
    await expect(row).toHaveCount(1);
    return row;
}

/** 구매자가 주문 상세의 배송 완료 배송에서 교환 · 환불을 신청한다. 접수 완료 안내가 뜰 때까지 간다. */
async function applyClaim(page: Page, orderId: number, kind: '반품' | '교환', reasonValue: 'SIMPLE_CHANGE' | 'SIZE_MISMATCH') {
    await page.goto(`/mypage/orders/${orderId}/claim`);
    const checkbox = page.locator('input[name="claim-item"]');
    await expect(checkbox).toBeEnabled();
    await checkbox.check();
    await page.getByRole('radio', { name: kind === '반품' ? /반품/ : /상품 교환/ }).check();
    await page.locator('#claim-reason').selectOption(reasonValue);
    await page.getByRole('button', { name: '요청하기' }).click();
    await expect(page).toHaveURL(/\/mypage\/claims\?created=\d+/);
    await expect(page.getByText(/이\(가\) 접수되었습니다/)).toBeVisible();
    return Number(new URL(page.url()).searchParams.get('created'));
}

/** 판매자 클레임 검토 창에서 전체 승인(또는 전체 거절 + 사유) 후 처리. */
async function decideAll(sp: Page, row: ReturnType<Page['locator']>, decision: 'approve' | 'reject') {
    await row.getByRole('button', { name: '검토하기' }).click();
    const dialog = sp.getByRole('dialog');
    if (decision === 'approve') {
        await dialog.getByRole('button', { name: '전체 승인' }).click();
    } else {
        await dialog.getByRole('button', { name: '전체 거절' }).click();
        await dialog.getByLabel('거절 사유 (구매자에게 보여요)').fill('e2e 거절 사유');
    }
    await dialog.getByRole('button', { name: '처리', exact: true }).click();
    await expect(dialog).toBeHidden();
}

test.describe('구매자 e2e-buyer1 · 판매자 e2e-seller', () => {
    test.use({ storageState: authFile('buyer1') });

    test('E08 결제 → 판매자 송장 · 출고 → 배송 완료(자동) → 구매 확정', async ({ page, request, browser, baseURL }) => {
        test.setTimeout(180_000);
        const o = orders.e08;

        // 1) 결제 직후: 구매자 주문 상세에 배송 요청
        await page.goto(`/mypage/orders/${o.orderId}`);
        await expect(statusOf(page)).toHaveAttribute('data-delivery-status', 'REQUESTED');

        // 2) 판매자: 송장 등록 → 배송 준비 → 출고 → 배송 중
        const { ctx, page: sp } = await sellerPage(browser, baseURL);
        try {
            let row = await shippingRow(sp, 'REQUESTED', names.e08);
            await expect(row.getByText('배송요청')).toBeVisible();
            await row.getByRole('combobox').selectOption('CJ대한통운');
            await row.getByPlaceholder('송장번호 입력').fill(`E2E08${Date.now() % 1_000_000}`);
            await row.getByRole('button', { name: '등록', exact: true }).click();
            await expect(sp.locator('tr', { hasText: names.e08 })).toHaveCount(0); // 배송 요청 탭에서 빠짐
            expect(await deliveryStatusOf(sellerApi, o.deliveryId)).toBe('PREPARING');

            await page.reload();
            await expect(statusOf(page)).toHaveAttribute('data-delivery-status', 'PREPARING');

            row = await shippingRow(sp, 'PREPARING', names.e08);
            await expect(row.getByText('배송준비')).toBeVisible();
            sp.once('dialog', (d) => void d.accept());
            await row.getByRole('button', { name: '출고', exact: true }).click();
            await expect(sp.locator('tr', { hasText: names.e08 })).toHaveCount(0);
            expect(await deliveryStatusOf(sellerApi, o.deliveryId)).toBe('SHIPPING');
            row = await shippingRow(sp, 'SHIPPING', names.e08);
            await expect(row.getByText('배송중')).toBeVisible();
        } finally {
            await ctx.close();
        }

        // 3) 구매자: 배송 중 → (자동) 배송 완료 → 구매 확정
        await page.reload();
        await expect(statusOf(page)).toHaveAttribute('data-delivery-status', /SHIPPING|DELIVERED/);
        await waitDeliveredAll(request, [o.deliveryId]);
        await page.reload();
        await expect(statusOf(page)).toHaveAttribute('data-delivery-status', 'DELIVERED');
        await expect(page.getByText('상품을 받으셨다면 구매를 확정해 주세요.')).toBeVisible();

        await page.getByRole('button', { name: '구매 확정', exact: true }).click();
        await page.getByRole('button', { name: '구매 확정하기' }).click();
        await expect(statusOf(page)).toHaveAttribute('data-delivery-status', 'CONFIRMED');
        await expect(page.getByText('구매가 확정되었습니다.')).toBeVisible();
        expect(await deliveryStatusOf(request, o.deliveryId)).toBe('CONFIRMED');
    });

    test('E09 환불 신청 → 판매자 수락(환불) → 완료', async ({ page, request, browser, baseURL }) => {
        test.setTimeout(240_000);
        const o = orders.e09;
        await waitDeliveredAll(request, [o.deliveryId, orders.e20.deliveryId, orders.e21.deliveryId, orders.e30.deliveryId]);
        const before = await walletBalance(request);

        // 구매자: 반품(환불) 신청 → 접수 안내, 내역에 반품 요청
        const claimId = await applyClaim(page, o.orderId, '반품', 'SIMPLE_CHANGE');
        const card = page.locator(`li[data-claim-id="${claimId}"]`);
        await expect(card).toContainText('환불');
        await expect(card).toContainText(names.e09);
        await expect(async () => {
            await page.reload();
            await expect(card).toHaveAttribute('data-claim-status', 'REQUESTED', { timeout: 3_000 });
        }).toPass({ timeout: 60_000, intervals: [3_000] });
        await expect(card.getByTestId('claim-status')).toHaveText('판매자 확인 중');

        const { ctx, page: sp } = await sellerPage(browser, baseURL);
        try {
            // 판매자: 검토 → 전체 승인
            let row = await claimRow(sp, 'pending', names.e09);
            await expect(row.getByText('처리 대기')).toBeVisible();
            await decideAll(sp, row, 'approve');

            // 환불은 비동기. 끝나면 "반품 완료"를 누를 수 있다.
            row = await claimRow(sp, 'progress', names.e09);
            const complete = row.getByRole('button', { name: '반품 완료' });
            await expect(complete).toBeEnabled({ timeout: 90_000 });
            sp.once('dialog', (d) => void d.accept());
            await complete.click();
            row = await claimRow(sp, 'done', names.e09);
            await expect(row.getByText('완료', { exact: true })).toBeVisible();
        } finally {
            await ctx.close();
        }

        // 구매자: 클레임 처리 완료, 예치금 환불
        await page.goto('/mypage/claims');
        await expect(page.locator(`li[data-claim-id="${claimId}"]`)).toHaveAttribute('data-claim-status', 'COMPLETED');
        await expect(page.locator(`li[data-claim-id="${claimId}"] [data-refund-status]`)).toHaveAttribute('data-refund-status', 'COMPLETED');
        await expect(page.locator(`li[data-claim-id="${claimId}"]`).getByText('예치금 환불 완료')).toBeVisible();
        expect(await walletBalance(request)).toBe(before + PRICE);
    });

    test('E20 교환 신청 → 판매자 수락 → 완료', async ({ page, request, browser, baseURL }) => {
        test.setTimeout(180_000);
        const o = orders.e20;
        await waitDeliveredAll(request, [o.deliveryId]);
        const before = await walletBalance(request);

        const claimId = await applyClaim(page, o.orderId, '교환', 'SIZE_MISMATCH');
        const card = page.locator(`li[data-claim-id="${claimId}"]`);
        await expect(card).toContainText('교환');
        await expect(async () => {
            await page.reload();
            await expect(card).toHaveAttribute('data-claim-status', 'REQUESTED', { timeout: 3_000 });
        }).toPass({ timeout: 60_000, intervals: [3_000] });

        const { ctx, page: sp } = await sellerPage(browser, baseURL);
        try {
            let row = await claimRow(sp, 'pending', names.e20);
            await decideAll(sp, row, 'approve');
            row = await claimRow(sp, 'progress', names.e20);
            await expect(row.getByText('처리 중')).toBeVisible();
            sp.once('dialog', (d) => void d.accept());
            await row.getByRole('button', { name: '교환 완료' }).click();
            row = await claimRow(sp, 'done', names.e20);
            await expect(row.getByText('완료', { exact: true })).toBeVisible();
        } finally {
            await ctx.close();
        }

        await page.goto('/mypage/claims');
        await expect(page.locator(`li[data-claim-id="${claimId}"]`)).toHaveAttribute('data-claim-status', 'COMPLETED');
        // 교환은 금액이 움직이지 않는다
        expect(await walletBalance(request)).toBe(before);
    });

    test('E21 클레임 진행 중에는 구매 확정할 수 없다', async ({ page, request }) => {
        test.setTimeout(150_000);
        const o = orders.e21;
        await waitDeliveredAll(request, [o.deliveryId]);
        const pendingBefore = await sellerClaimCount(sellerApi, 'REQUESTED');

        await applyClaim(page, o.orderId, '교환', 'SIMPLE_CHANGE');
        await expect.poll(() => sellerClaimCount(sellerApi, 'REQUESTED'), { timeout: 60_000, intervals: [2_000] }).toBe(pendingBefore + 1);

        // 화면: 구매 확정 버튼은 막히고, 진행 중임을 안내한다
        await page.goto(`/mypage/orders/${o.orderId}`);
        await expect(statusOf(page)).toHaveAttribute('data-delivery-status', 'DELIVERED');
        await expect(page.getByRole('button', { name: '구매 확정', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: '교환 · 환불 진행 중' })).toBeDisabled();
        await expect(page.getByText(/교환 요청이 접수되어 판매자 확인 중입니다\. 처리가 끝나면 구매 확정할 수 있습니다\./)).toBeVisible();

        // 서버: 직접 확정을 시도해도 거절된다
        const res = await request.patch(`/api/deliveries/${o.deliveryId}/confirm`);
        expect(res.status()).toBe(409);
        expect(await res.text()).toContain('DELIVERY_CLAIM_IN_PROGRESS');
        expect(await deliveryStatusOf(request, o.deliveryId)).toBe('DELIVERED');
    });

    test('E23 판매자 대시보드의 배송 · 클레임 건수가 실제와 맞다', async ({ browser, baseURL }) => {
        test.setTimeout(180_000);
        const { ctx, page: sp } = await sellerPage(browser, baseURL);
        const card = (label: string) => sp.locator('div.min-h-48').filter({ hasText: label });
        const num = (label: string) => card(label).locator('span.text-display-xl');

        // 화면 숫자 = API 건수(배송 요청 · 준비 · 중, 클레임 대기 · 환불 · 교환)
        async function expectDashboard(expected: { requested: number; preparing: number; shipping: number; claim: number; refund: number; exchange: number }) {
            await expect(num('배송 요청 건수')).toHaveText(String(expected.requested));
            await expect(card('배송 요청 건수')).toContainText(`배송 준비 ${expected.preparing}건`);
            await expect(card('배송 요청 건수')).toContainText(`배송 중 ${expected.shipping}건`);
            await expect(num('교환·환불 대기 건수')).toHaveText(String(expected.claim));
            await expect(card('교환·환불 대기 건수')).toContainText(`환불 ${expected.refund}건`);
            await expect(card('교환·환불 대기 건수')).toContainText(`교환 ${expected.exchange}건`);
        }
        const actual = async () => ({
            requested: await sellerDeliveryCount(sellerApi, 'REQUESTED'),
            preparing: await sellerDeliveryCount(sellerApi, 'PREPARING'),
            shipping: await sellerDeliveryCount(sellerApi, 'SHIPPING'),
            claim: await sellerClaimCount(sellerApi, 'REQUESTED'),
            refund: await sellerClaimCount(sellerApi, 'REQUESTED', 'REFUND'),
            exchange: await sellerClaimCount(sellerApi, 'REQUESTED', 'EXCHANGE'),
        });

        try {
            await sp.goto('/seller');
            const base = await actual();
            await expectDashboard(base);
            expect(base.exchange).toBeGreaterThanOrEqual(1); // E21이 남긴 접수 대기 교환 요청

            // 결제해 둔 E23 주문(배송 요청에 포함)을 송장 등록 → 준비로, 출고 → 배송 중으로 옮길 때마다 숫자가 따라 움직인다
            const o = orders.e23;
            await sellerApi.patch(`/api/deliveries/${o.deliveryId}/ready`, { data: { carrier: 'CJ대한통운', trackingNumber: `E2E23${Date.now() % 100000}` } });
            await sp.reload();
            await expectDashboard({ ...base, requested: base.requested - 1, preparing: base.preparing + 1 });
            await sellerApi.patch(`/api/deliveries/${o.deliveryId}/ship`);
            await sp.reload();
            await expectDashboard({ ...base, requested: base.requested - 1, preparing: base.preparing, shipping: base.shipping + 1 });

            // 접수 대기 클레임을 거절하면 대기 건수가 줄고 구매자는 다시 확정할 수 있다(E21 정리)
            const row = await claimRow(sp, 'pending', names.e21);
            await decideAll(sp, row, 'reject');
            await sp.goto('/seller');
            await expectDashboard({ ...base, requested: base.requested - 1, preparing: base.preparing, shipping: base.shipping + 1, claim: base.claim - 1, exchange: base.exchange - 1 });
        } finally {
            await ctx.close();
        }
        // 거절 뒤에는 구매 확정이 막히지 않는다
        await confirmDeliveryApi(buyerApi, orders.e21.deliveryId);
    });

    test('E30 구매 확정 → 정산 대기 → 지급 배치 → 지급 완료', async ({ request, browser, baseURL }) => {
        test.setTimeout(600_000);
        const o = orders.e30;
        const sellerInfo = await (await sellerApi.get('/api/members/me/seller')).json();
        const sellerId = Number(sellerInfo.data?.id ?? sellerInfo.data?.sellerId ?? sellerInfo.id);
        await waitDeliveredAll(request, [o.deliveryId]);

        await confirmDeliveryApi(request, o.deliveryId);

        // 정산 대기: 판매 금액 · 수수료 3% · 지급액
        const newRows = async () => (await listPayouts(sellerId)).filter((p) => p.orderId === o.orderId);
        await expect.poll(async () => (await newRows()).length, { timeout: 60_000, message: '구매 확정 뒤 정산 행이 만들어지지 않았습니다' }).toBe(1);
        const row = (await newRows())[0];
        expect(row.status).toBe('PENDING');
        expect(row.feeAmount).toBe(Math.floor((PRICE * 3) / 100));
        expect(row.payoutAmount).toBe(PRICE - row.feeAmount);
        expect(row.paidAt).toBeNull();

        const { ctx, page: sp } = await sellerPage(browser, baseURL);
        try {
            await sp.goto('/seller/settlements');
            await expect(sp.getByText('정산 예정').first()).toBeVisible({ timeout: 45_000 }); // 개발 서버 첫 컴파일이 느리다
            await expect(sp.getByText(/수수료 \(3%\)/)).toBeVisible();

            if (await payoutBatchRanToday()) {
                // 지급 배치는 같은 날 한 번만 돈다. 오늘 이미 돈 뒤라면 새 정산은 대기로 남는다. 앞서 지급된 정산이 있으면 그 금액 · 화면만 확인한다.
                test.info().annotations.push({ type: 'note', description: '오늘 이미 지급 배치가 돌았습니다. 새 정산 지급은 다음 날(또는 e2e:env:reset 뒤) 첫 실행에서 확인됩니다.' });
                const done = (await listPayouts(sellerId)).find((p) => p.status === 'COMPLETED');
                if (done) {
                    expect(done.feeAmount).toBe(Math.floor((done.salesAmount * 3) / 100));
                    expect(done.payoutAmount).toBe(done.salesAmount - done.feeAmount);
                    expect(done.paidAt).not.toBeNull();
                    await sp.reload();
                    await expect(sp.getByText('정산 완료').first()).toBeVisible({ timeout: 30_000 });
                }
                expect((await listPayouts(sellerId)).find((p) => p.id === row.id)?.status).toBe('PENDING');
                return;
            }

            // 지급 대상으로 당긴 뒤 매분 cron으로 payment 서비스를 다시 띄우면, 다시 뜬 첫 분에 배치가 이 정산을 지급한다.
            // (먼저 띄워 두면 지급 대상이 없는 채로 그날 배치를 써 버린다.) 끝나면 기본 cron으로 되돌려 다음 날 첫 실행을 막지 않는다.
            const pendingRows = (await listPayouts(sellerId)).filter((p) => p.status === 'PENDING');
            const expectedDeposit = pendingRows.reduce((sum, p) => sum + p.payoutAmount, 0);
            const walletBefore = await walletBalance(sellerApi);
            expect(await makePayoutsDue(sellerId)).toBe(pendingRows.length);
            const originalCron = currentPayoutCron();
            cronToRestore = originalCron === EVERY_MINUTE_PAYOUT_CRON ? DEFAULT_PAYOUT_CRON : originalCron;
            try {
                restartPaymentWithPayoutCron(EVERY_MINUTE_PAYOUT_CRON);
                await expect
                    .poll(async () => (await listPayouts(sellerId)).find((p) => p.id === row.id)?.status, { timeout: 180_000, intervals: [5_000], message: '지급 배치가 정산을 지급하지 않았습니다(매분 cron으로 다시 띄웠는지: e2e/infra/README.md)' })
                    .toBe('COMPLETED');
            } finally {
                try {
                    restartPaymentWithPayoutCron(cronToRestore);
                    cronToRestore = null;
                } catch (e) {
                    console.error(`지급 cron 복원 실패, afterAll에서 다시 시도: ${(e as Error).message}`);
                }
            }
            const paid = (await listPayouts(sellerId)).find((p) => p.id === row.id)!;
            expect(paid.paidAt).not.toBeNull();

            // 이 판매자의 대기 정산이 모두 지급됐고, 판매자 잔액은 지급액(수수료 3% 제외) 합계만큼 늘었다
            expect((await listPayouts(sellerId)).filter((p) => p.status === 'PENDING')).toHaveLength(0);
            expect(await walletBalance(sellerApi)).toBe(walletBefore + expectedDeposit);

            await sp.goto('/seller/settlements');
            await expect(sp.getByText('정산 완료').first()).toBeVisible({ timeout: 30_000 });
            await expect(sp.getByText(`₩ ${(PRICE - paid.feeAmount).toLocaleString('ko-KR')}`).first()).toBeVisible();
        } finally {
            await ctx.close();
        }
    });
});
