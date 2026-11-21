import { expect, test } from '@playwright/test';
import { waitForMailCode } from '../../e2e/support/codes';
import { currentPayoutCron, DEFAULT_PAYOUT_CRON, EVERY_MINUTE_PAYOUT_CRON, listPayouts, makePayoutsDue, restartPaymentWithPayoutCron } from '../../e2e/support/payout';
import { walletBalance, won } from '../../e2e/support/shop';
import { SELLER_STATE, clearTodayPayoutBatchRuns, member, newScene, sellerApi } from '../support/shared';

// E30 구매 확정 → 정산 대기 → 지급 배치 → 지급 완료, E19 예치금 출금.
// 지급 예정일(다음 달 15일)은 기다릴 수 없어서, 이 판매자의 대기 정산만 지급 대상으로 당기고 지급 배치(payment의 cron)를 매분으로 돌려 지급시킨다(화면 밖).
test('장면 12 정산과 출금 (E30 · E19)', async ({ browser, baseURL, playwright }) => {
    test.setTimeout(20 * 60_000);
    const m = member();
    const api = await sellerApi(playwright, baseURL);
    const info = (await (await api.get('/api/members/me/seller')).json()).data;
    const sellerId = Number(info.id ?? info.sellerId);
    const pending = (await listPayouts(sellerId)).filter((p) => p.status === 'PENDING');
    expect(pending.length, '구매 확정(장면 10)으로 생긴 대기 정산').toBeGreaterThan(0);
    const net = pending.reduce((sum, p) => sum + p.payoutAmount, 0);
    const fee = pending.reduce((sum, p) => sum + p.feeAmount, 0);
    const sales = pending.reduce((sum, p) => sum + p.salesAmount, 0);
    const walletBefore = await walletBalance(api);

    const s = newScene(12, 'E30·E19', '정산과 출금', browser, baseURL);
    try {
        const a = await s.open({ storageState: SELLER_STATE });
        await a.beat(`구매가 확정되면 판매자에게 정산이 생깁니다. 정산 화면에는 판매 금액 ${won(sales)}에서 수수료 3퍼센트를 뺀 지급 예정 금액이 정산 예정으로 표시됩니다.`, async () => {
            await a.page.goto('/seller/settlements');
            await expect(a.page.getByText('정산 예정').first()).toBeVisible({ timeout: 30_000 });
            await expect(a.page.getByText(/수수료 \(3%\)/)).toBeVisible();
        });
        await a.close();

        // 화면 밖: 지급 예정일을 당기고 지급 배치를 돌린다
        await clearTodayPayoutBatchRuns();
        expect(await makePayoutsDue(sellerId)).toBe(pending.length);
        const original = currentPayoutCron();
        const restore = original === EVERY_MINUTE_PAYOUT_CRON ? DEFAULT_PAYOUT_CRON : original;
        try {
            restartPaymentWithPayoutCron(EVERY_MINUTE_PAYOUT_CRON);
            await expect
                .poll(async () => (await listPayouts(sellerId)).filter((p) => p.status === 'PENDING').length, { timeout: 240_000, intervals: [5_000], message: '지급 배치가 정산을 지급하지 않았습니다' })
                .toBe(0);
        } finally {
            restartPaymentWithPayoutCron(restore);
        }
        const paid = (await listPayouts(sellerId)).filter((p) => p.status === 'COMPLETED');
        expect(paid.reduce((sum, p) => sum + p.feeAmount, 0)).toBe(fee);
        expect(await walletBalance(api)).toBe(walletBefore + net);
        await api.storageState({ path: SELLER_STATE }).catch(() => {});
        await api.dispose();

        const b = await s.open({ storageState: SELLER_STATE });
        await b.beat('정해진 날에 지급 배치가 돌면 정산이 지급 완료로 바뀝니다. 수수료를 뺀 금액이 판매자의 예치금으로 들어갑니다.', async () => {
            await b.page.goto('/seller/settlements');
            await expect(b.page.getByText('정산 완료').first()).toBeVisible({ timeout: 30_000 });
            await expect(b.page.getByText(/정산 대기\s*0건/)).toBeVisible();
        });
        await b.beat('판매 대금은 예치금 관리 화면에서 확인하고 출금할 수 있습니다. 출금하려면 먼저 이메일 인증으로 출금 계좌를 등록합니다.', async () => {
            await b.page.goto('/mypage/deposit/withdraw');
            await expect(b.page.getByText('출금 계좌 등록')).toBeVisible();
            const since = Date.now();
            await b.page.getByRole('button', { name: '인증번호 받기' }).click();
            await b.page.locator('#payout-email-code').fill(await waitForMailCode(m.email, since));
            await b.page.getByRole('button', { name: '인증하기' }).click();
            await b.page.locator('#payout-bank').selectOption('국민은행');
            await b.page.locator('#payout-holder').fill(m.nickname);
            await b.page.locator('#payout-account-number').fill('1002000000001');
            await b.page.getByRole('button', { name: '계좌 등록' }).click();
            await expect(b.page.getByRole('button', { name: '계좌 변경' })).toBeVisible({ timeout: 20_000 });
        });
        await b.beat('출금할 금액을 입력하고 신청하면 예치금에서 바로 차감되고, 이체는 서버가 처리합니다.', async () => {
            await b.page.locator('#withdraw-amount').fill('30000');
            await b.page.getByRole('button', { name: '출금 요청' }).click();
            await b.page.getByRole('button', { name: '출금 신청' }).click();
            await expect(b.page.getByRole('heading', { name: /출금을 신청했습니다|출금이 완료되었습니다/ })).toBeVisible({ timeout: 30_000 });
        });
        await b.beat('거래 내역에도 출금 기록이 남습니다.', async () => {
            await b.page.goto('/mypage/deposit/history');
            await expect(b.page.getByRole('row', { name: /예치금 출금.*-30,000원/ }).first()).toBeVisible();
        });
        await b.close();
    } finally {
        await s.save();
    }
});
