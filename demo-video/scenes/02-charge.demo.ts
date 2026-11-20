import { expect, test } from '@playwright/test';
import { walletBalance, won } from '../../e2e/support/shop';
import { SELLER_STATE, newScene } from '../support/shared';

// E02 예치금 충전. 카드사 인증 뒤 승인 단계는 로컬 환경의 가짜 토스(toss-stub)가 대신한다.
test('장면 02 예치금 충전 (E02)', async ({ browser, baseURL }) => {
    const s = newScene(2, 'E02', '예치금 충전', browser, baseURL);
    try {
        const n = await s.open({ storageState: SELLER_STATE });
        const page = n.page;
        let orderNumber = '';
        await n.beat('구매에는 예치금을 씁니다. 마이페이지의 충전 화면에서 금액을 고르고 결제하기를 누릅니다.', async () => {
            await page.goto('/mypage/deposit/charge');
            await page.getByRole('button', { name: '50,000원' }).click();
            const ordered = page.waitForResponse((r) => r.url().endsWith('/api/wallets/me/charges') && r.request().method() === 'POST');
            await page.getByRole('button', { name: '결제하기' }).click();
            orderNumber = (await (await ordered).json()).data.orderNumber as string;
        });
        await n.beat('토스페이먼츠 결제창이 열리고, 충전 금액과 상품명이 그대로 표시됩니다.', async () => {
            await expect.poll(() => page.frames().some((f) => f.url().includes('tosspayments.com')), { timeout: 30_000 }).toBe(true);
            const toss = page.frames().find((f) => f.url().includes('tosspayments.com'))!;
            await expect(toss.getByText('50,000원').first()).toBeVisible();
        });
        await n.beat('카드사 인증까지 마치면 결제가 승인됩니다. 이 시연에서는 카드사 인증 이후의 승인 응답을 모의 서버로 대신했습니다.', async () => {
            const paymentKey = `demo_${Date.now()}`;
            await page.goto(`/mypage/deposit/charge/success?paymentKey=${paymentKey}&orderId=${orderNumber}&amount=50000`);
            await expect(page.getByRole('heading', { name: '충전이 완료되었습니다' })).toBeVisible({ timeout: 30_000 });
        });
        await n.beat('충전이 완료되면 잔액이 바로 늘어나고, 같은 결제를 새로고침해도 중복 충전되지 않습니다.', async () => {
            await page.reload();
            await expect(page.getByRole('heading', { name: '충전이 완료되었습니다' })).toBeVisible({ timeout: 30_000 });
            expect(await walletBalance(page.request)).toBe(50_000);
        });
        await n.beat('거래 내역에서도 충전 기록을 확인할 수 있습니다.', async () => {
            await page.goto('/mypage/deposit/history');
            await expect(page.getByRole('row').filter({ hasText: '예치금 충전' }).filter({ hasText: `+${won(50_000)}` }).first()).toBeVisible();
        });
        await n.close();
    } finally {
        await s.save();
    }
});
