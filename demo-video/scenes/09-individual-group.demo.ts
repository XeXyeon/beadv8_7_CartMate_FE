import { expect, test } from '@playwright/test';
import { authFile } from '../../e2e/support/config.mjs';
import { findPickButton, releaseAbuse, walletBalance } from '../../e2e/support/group-helpers';
import { setWalletBalance } from '../../e2e/support/wallet';
import { createDemoPost, productImage } from '../support/data';
import { SELLER_STATE, newScene, sellerApi } from '../support/shared';

// E13 개인물품 공구: 만든 사람(buyer2)이 공구를 열고 → 초대 링크로 들어온 사람(buyer1)이 각자 주문 · 결제 → 만든 사람 현황판에 주문이 보인다.
const PRICE = 10_000;

test('장면 09 개인물품 공구 (E13)', async ({ browser, baseURL, playwright }) => {
    await releaseAbuse(playwright, baseURL, ['buyer1', 'buyer2']);
    await setWalletBalance('buyer1', 50_000);
    const seller = await sellerApi(playwright, baseURL);
    const post = await createDemoPost(seller, { title: '팀 트레이닝 반팔티', name: '팀 트레이닝 반팔티', price: PRICE, image: await productImage(browser, '👕', '팀 트레이닝 반팔티', '#bbf7d0') });
    await seller.storageState({ path: SELLER_STATE }).catch(() => {});
    await seller.dispose();
    const title = '풋살팀 트레이닝복 공구';
    const s = newScene(9, 'E13', '공동구매 ③: 개인물품 공구', browser, baseURL);
    let groupId = 0;
    let invitePath = '';
    try {
        const a = await s.open({ storageState: authFile('buyer2') });
        await a.beat('두 번째 방식은 개인물품 공구입니다. 상품은 각자 따로 주문하고 결제하지만, 만든 사람이 모집과 주문 현황을 한곳에서 관리합니다. 제목을 쓰고 판매 중인 상품을 골라 공동구매를 만듭니다.', async () => {
            await a.page.goto('/group-purchases/individual/new');
            await a.page.getByPlaceholder('예) 풋살팀 트레이닝복 같이 사요').fill(title);
            await (await findPickButton(a.page, post.title)).click();
            await a.page.getByRole('button', { name: '공동구매 만들기' }).click();
            await a.page.waitForURL(/\/group-purchases\/individual\/\d+$/);
            groupId = Number(a.page.url().split('/').pop());
            await expect(a.page.getByRole('heading', { name: title })).toBeVisible();
            invitePath = new URL(await a.page.getByLabel('초대 링크').inputValue()).pathname;
        });
        await a.beat('관리 화면에는 팀원에게 보낼 초대 링크가 만들어집니다.', async () => {
            await a.page.getByLabel('초대 링크').scrollIntoViewIfNeeded();
        });
        await a.close();

        const b = await s.open({ storageState: authFile('buyer1') });
        const before = await walletBalance(b.context.request);
        await b.beat('팀원은 초대 링크로 들어와 수량을 고르고, 배송지를 확인한 뒤 주문합니다.', async () => {
            const page = b.page;
            await page.goto(invitePath);
            await expect(page.getByRole('heading', { name: title })).toBeVisible();
            await page.getByRole('button', { name: '수량 늘리기' }).first().click();
            const fill = async (label: string, value: string, exact = false) => {
                const field = page.getByLabel(label, { exact });
                if (!(await field.inputValue())) await field.fill(value);
            };
            await fill('받는 분', '김시연');
            await fill('연락처', '010-9000-1234');
            await fill('우편번호', '06234');
            await fill('주소', '서울특별시 강남구 테헤란로 123', true);
            await page.getByText('주문 상품, 배송지, 주문 금액을 확인했습니다.').click();
            await page.getByRole('button', { name: /원 주문하기$/ }).click();
            await page.waitForURL(/\/checkout\?order=\d+/);
            await expect(page.getByRole('heading', { name: '주문이 접수되었습니다' })).toBeVisible();
        });
        await b.beat('결제는 개인 주문서에서 예치금으로 바로 합니다.', async () => {
            await b.page.getByRole('button', { name: /예치금으로 결제하기$/ }).click();
            await expect(b.page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(b.context.request)).toBe(before - PRICE);
        });
        await b.close();

        const a2 = await s.open({ storageState: authFile('buyer2') });
        await a2.beat('만든 사람의 현황판에는 결제가 끝난 주문 건수와 구매자 수, 총 수량이 집계됩니다.', async () => {
            await a2.page.goto(`/group-purchases/individual/${groupId}/dashboard`);
            const stat = (label: string) => a2.page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
            await expect(async () => {
                await a2.page.reload();
                await expect(stat('결제 완료 주문')).toHaveText('1건', { timeout: 3_000 });
            }).toPass({ timeout: 60_000 });
            await expect(stat('구매자')).toHaveText('1명');
        });
        await a2.close();
    } finally {
        await s.save();
    }
});
