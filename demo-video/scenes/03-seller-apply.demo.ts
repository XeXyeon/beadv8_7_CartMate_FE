import { expect, test } from '@playwright/test';
import { SELLER_STATE, member, newScene, rand } from '../support/shared';

// E29 판매자 신청: 계좌 확인 불일치는 막고, 통과하면 판매자가 된다.
test('장면 03 판매자 신청 (E29)', async ({ browser, baseURL }) => {
    const m = member();
    const s = newScene(3, 'E29', '판매자 신청', browser, baseURL);
    try {
        const n = await s.open({ storageState: SELLER_STATE });
        const page = n.page;
        await n.beat('물건을 팔고 싶다면 판매자 신청을 합니다. 개인 판매자를 고르고, 연락처와 정산받을 계좌 정보를 입력합니다.', async () => {
            await page.goto('/mypage/seller-apply');
            await page.getByText('개인 판매자').click();
            await page.locator('#seller-phone').fill(m.phone);
            await page.locator('#seller-bank').selectOption('국민은행');
            await page.locator('#seller-holder').fill(m.nickname);
        });
        await n.beat('계좌는 신청 전에 실제 예금주와 맞는지 확인합니다. 예금주가 맞지 않는 계좌는 이렇게 거절됩니다.', async () => {
            await page.locator('#seller-account').fill(`1002${rand(8)}0000`);
            await page.getByRole('button', { name: '계좌 확인' }).click();
            await expect(page.getByText('계좌 확인에 실패했습니다').or(page.locator('span.text-error').first())).toBeVisible();
            await page.getByRole('checkbox').check();
            await page.getByRole('button', { name: '판매자 등록하기' }).click();
            await expect(page.getByText('정산 계좌 확인을 해주세요.')).toBeVisible();
        });
        await n.beat('올바른 계좌로 다시 확인하면 확인 완료가 되고, 판매자 등록을 마칠 수 있습니다.', async () => {
            await page.locator('#seller-account').fill(`1002${rand(8)}1234`);
            await page.getByRole('button', { name: '계좌 확인' }).click();
            await expect(page.getByRole('button', { name: '확인완료' })).toBeVisible();
            await page.getByRole('button', { name: '판매자 등록하기' }).click();
            await expect(page.getByText('판매자 (활성)')).toBeVisible({ timeout: 30_000 });
        });
        await n.beat('이제 판매자 센터가 열립니다. 상품 등록과 배송, 클레임, 정산을 이곳에서 관리합니다.', async () => {
            await page.goto('/seller');
            await expect(page).toHaveURL(/\/seller$/);
        });
        await n.context.storageState({ path: SELLER_STATE });
        await n.close();
    } finally {
        await s.save();
    }
});
