import { expect, test } from '@playwright/test';
import { authFile } from '../../e2e/support/config.mjs';
import { setWalletBalance } from '../../e2e/support/wallet';
import { addSharedItem, closeSharedGroup, createSharedGroup, joinByInvite, openSharedPayment, paySharedShare, releaseAbuse, shareAmount, walletBalance } from '../../e2e/support/group-helpers';
import { createDemoPost, productImage } from '../support/data';
import { SELLER_STATE, newScene, sellerApi } from '../support/shared';

// E11 결제 중 만든 사람이 취소하면, 이미 결제한 참여자에게 분담금이 환불된다.
// 공동구매를 만들고 마감하는 과정은 화면 밖에서 준비하고(E10에서 보였다), 결제 → 취소 → 환불만 녹화한다.
const PRICE = 10_000;

test('장면 08 N빵 취소와 환불 (E11)', async ({ browser, baseURL, playwright }) => {
    await releaseAbuse(playwright, baseURL, ['buyer1', 'buyer2']);
    await setWalletBalance('buyer1', 50_000);
    await setWalletBalance('buyer2', 0);
    const seller = await sellerApi(playwright, baseURL);
    const post = await createDemoPost(seller, { title: '러닝 헤드밴드 2개 세트', name: '러닝 헤드밴드', price: PRICE, image: await productImage(browser, '🏃', '러닝 헤드밴드', '#fecaca') });
    await seller.storageState({ path: SELLER_STATE }).catch(() => {});
    await seller.dispose();

    // 준비(녹화하지 않음): 만든 사람 buyer2, 참여자 buyer1이 담고 마감
    const mk = async (key: 'buyer1' | 'buyer2') => {
        const context = await browser.newContext({ baseURL, storageState: authFile(key) });
        const page = await context.newPage();
        page.on('dialog', (d) => void d.accept());
        return { context, page };
    };
    const creator = await mk('buyer2');
    const member = await mk('buyer1');
    let id = 0;
    try {
        const g = await createSharedGroup(creator.page, '풋살팀 간식 공동구매', 2);
        id = g.id;
        await joinByInvite(member.page, id, g.code);
        await addSharedItem(member.page, id, post, 1);
        await closeSharedGroup(creator.page, id);
    } finally {
        await creator.context.storageState({ path: authFile('buyer2') }).catch(() => {});
        await member.context.storageState({ path: authFile('buyer1') }).catch(() => {});
        await creator.context.close();
        await member.context.close();
    }

    const s = newScene(8, 'E11', '공동구매 ②: 취소와 환불', browser, baseURL);
    try {
        const m = await s.open({ storageState: authFile('buyer1') });
        const before = await walletBalance(m.context.request);
        await m.beat('N빵에서 결제가 한창일 때 일이 틀어지면 어떻게 될까요? 참여자가 먼저 자기 몫을 결제합니다.', async () => {
            await openSharedPayment(m.page, id);
            const share = await shareAmount(m.page);
            await paySharedShare(m.page);
            await expect(m.page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(m.context.request)).toBe(before - share);
        });
        await m.close();

        const c = await s.open({ storageState: authFile('buyer2') });
        await c.beat('아직 결제하지 않은 만든 사람이 결제 화면에서 공동 주문을 취소합니다.', async () => {
            await openSharedPayment(c.page, id);
            await c.page.getByRole('button', { name: '공동 주문 취소' }).click();
            await expect(c.page.getByRole('heading', { name: '취소된 공동 주문입니다' })).toBeVisible();
        });
        await c.close();

        const m2 = await s.open({ storageState: authFile('buyer1') });
        await m2.beat('이미 결제한 참여자의 화면도 취소로 바뀌고, 결제했던 분담금은 예치금으로 자동 환불됩니다.', async () => {
            await m2.page.goto(`/group-purchases/${id}`);
            await openSharedPayment(m2.page, id);
            await expect(m2.page.getByRole('heading', { name: '취소된 공동 주문입니다' })).toBeVisible();
            await expect.poll(() => walletBalance(m2.context.request), { timeout: 60_000, intervals: [1_000] }).toBe(before);
            await m2.page.goto('/mypage/deposit');
        });
        await m2.close();
    } finally {
        await s.save();
    }
});
