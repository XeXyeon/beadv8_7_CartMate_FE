import { expect, test } from '@playwright/test';
import { withRunId } from '../../support/run';
import { closePeople, createPost, findPickButton, openPerson, requireBalance, walletBalance, type Person } from '../../support/group-helpers';
import { authFile } from '../../support/auth';

// E13 — 개인물품 공구: 만든 사람이 공구를 열고 → 초대 링크로 들어온 사람이 주문 → 개인 주문서에서 결제 → 만든 사람 현황판에 주문이 보인다.
// 만든 사람 = e2e-buyer2(잔액 불필요), 주문하는 사람 = e2e-buyer1.

const PRICE = 10_000;

test('E13 개인물품 공구 생성 → 초대 링크로 주문 → 결제 → 현황판에 주문', async ({ browser, baseURL, playwright }) => {
    let creator: Person | undefined;
    let buyer: Person | undefined;
    const seller = await playwright.request.newContext({ baseURL, storageState: authFile('seller') });
    try {
        const post = await createPost(seller, { name: `공구 상품 E13 ${Date.now()}`, price: PRICE });
        creator = await openPerson(browser, baseURL, 'buyer2');
        buyer = await openPerson(browser, baseURL, 'buyer1');
        const buyerBefore = await requireBalance(buyer, PRICE);

        // 만든 사람: 상품을 골라 공구 만들기 → 관리 화면의 초대 링크
        const title = withRunId('E13 공구');
        await creator.page.goto('/group-purchases/individual/new');
        await creator.page.getByPlaceholder('예) 풋살팀 트레이닝복 같이 사요').fill(title);
        await (await findPickButton(creator.page, post.title)).click();
        await creator.page.getByRole('button', { name: '공동구매 만들기' }).click();
        await creator.page.waitForURL(/\/group-purchases\/individual\/\d+$/);
        const groupId = Number(creator.page.url().split('/').pop());
        await expect(creator.page.getByRole('heading', { name: title })).toBeVisible();
        const inviteUrl = await creator.page.getByLabel('초대 링크').inputValue();
        expect(inviteUrl).toContain('/group-purchases/individual/invite/');

        // 주문하는 사람: 초대 링크 → 수량 1 → 배송지 → 주문
        await buyer.page.goto(new URL(inviteUrl).pathname);
        await expect(buyer.page.getByRole('heading', { name: title })).toBeVisible();
        await buyer.page.getByRole('button', { name: '수량 늘리기' }).first().click();
        const fill = async (label: string, value: string, exact = false) => {
            const field = buyer!.page.getByLabel(label, { exact });
            if (!(await field.inputValue())) await field.fill(value);
        };
        await fill('받는 분', 'e2e 수령인');
        await fill('연락처', '010-9000-1234');
        await fill('우편번호', '06234');
        await fill('주소', '서울특별시 강남구 테헤란로 123', true);
        await buyer.page.getByText('주문 상품, 배송지, 주문 금액을 확인했습니다.').click();
        await buyer.page.getByRole('button', { name: /원 주문하기$/ }).click();
        await buyer.page.waitForURL(/\/checkout\?order=\d+/);
        await expect(buyer.page.getByRole('heading', { name: '주문이 접수되었습니다' })).toBeVisible();

        // 개인 주문서에서 예치금 결제 → 잔액이 상품 금액만큼 빠진다
        await buyer.page.getByRole('button', { name: /예치금으로 결제하기$/ }).click();
        await expect(buyer.page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
        expect(await walletBalance(buyer.context.request)).toBe(buyerBefore - PRICE);

        // 만든 사람 현황판: 결제 완료 주문 1건 · 구매자 1명 · 총 수량 1개
        await creator.page.goto(`/group-purchases/individual/${groupId}/dashboard`);
        const stat = (label: string) => creator!.page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
        // 현황판 집계는 결제 이벤트가 퍼진 뒤에 반영된다 → 다시 불러오며 기다린다
        await expect(async () => {
            await creator!.page.reload();
            await expect(stat('결제 완료 주문')).toHaveText('1건', { timeout: 3_000 });
        }).toPass({ timeout: 45_000 });
        await expect(stat('구매자')).toHaveText('1명');
        await expect(stat('총 수량')).toHaveText('1개');
    } finally {
        await closePeople(creator, buyer);
        await seller.dispose();
    }
});
