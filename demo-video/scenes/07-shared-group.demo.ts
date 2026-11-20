import { expect, test } from '@playwright/test';
import { authFile } from '../../e2e/support/config.mjs';
import { setWalletBalance } from '../../e2e/support/wallet';
import { addSharedItem, closeSharedGroup, createSharedGroup, headcount, joinByInvite, openSharedPayment, paySharedShare, releaseAbuse, shareAmount, walletBalance } from '../../e2e/support/group-helpers';
import { createDemoPost, productImage } from '../support/data';
import { SELLER_STATE, newScene, sellerApi } from '../support/shared';

// E10 N빵(공동물품): 만든 사람(buyer1)이 열고 → 참여자(buyer2)가 초대 링크로 들어와 상품을 담고 → 마감 → 둘 다 분담금을 결제 → 공동 주문 확정.
const PRICE = 10_000;

test('장면 07 N빵 공동구매 (E10)', async ({ browser, baseURL, playwright }) => {
    await releaseAbuse(playwright, baseURL, ['buyer1', 'buyer2']);
    await setWalletBalance('buyer1', 50_000);
    await setWalletBalance('buyer2', 50_000);
    const seller = await sellerApi(playwright, baseURL);
    const post = await createDemoPost(seller, { title: '캠핑 보냉 텀블러 2개 세트', name: '캠핑 보냉 텀블러', price: PRICE, image: await productImage(browser, '🥤', '캠핑 보냉 텀블러', '#fde68a') });
    await seller.storageState({ path: SELLER_STATE }).catch(() => {});
    await seller.dispose();
    const title = '주말 캠핑 공동구매';
    const s = newScene(7, 'E10', '공동구매 ①: N빵', browser, baseURL);
    let id = 0;
    let code = '';
    try {
        // 1) 만든 사람
        const a = await s.open({ storageState: authFile('buyer1') });
        await a.beat('공동구매의 첫 번째 방식은 N빵입니다. 한 사람이 공동구매를 열고, 참여자가 각자 담은 금액을 나눠서 결제합니다. 제목과 최대 인원을 정하고 규칙에 동의하면 만들어집니다.', async () => {
            ({ id, code } = await createSharedGroup(a.page, title, 2));
        });
        await a.beat('만들어지면 초대 코드가 생기고, 이 링크를 친구에게 보내 참여시킬 수 있습니다.', async () => {
            await expect(a.page.getByRole('button', { name: /^초대 코드 복사 · / })).toBeVisible();
        });
        await a.close();

        // 2) 참여자
        const b = await s.open({ storageState: authFile('buyer2') });
        await b.beat('친구는 초대 링크로 들어와 공동구매 참여하기를 누릅니다.', async () => {
            await joinByInvite(b.page, id, code);
            await expect(b.page.getByRole('heading', { name: title })).toBeVisible();
        });
        await b.beat('참여한 사람은 공동 장바구니에 사고 싶은 상품과 수량을 담을 수 있습니다.', async () => {
            await addSharedItem(b.page, id, post, 1);
        });
        await b.close();

        // 3) 만든 사람이 마감
        const a2 = await s.open({ storageState: authFile('buyer1') });
        await a2.beat('만든 사람은 상세 화면에서 참여자 두 명과 담긴 상품을 확인하고, 지금 마감하기로 공동 주문을 만듭니다.', async () => {
            await a2.page.goto(`/group-purchases/${id}`);
            await expect(headcount(a2.page, '2명 / 최대 2명')).toBeVisible();
            await expect(a2.page.getByText(post.productName).first()).toBeVisible();
            await closeSharedGroup(a2.page, id);
        });
        await a2.close();

        // 4) 참여자 결제
        const b2 = await s.open({ storageState: authFile('buyer2') });
        const before2 = await walletBalance(b2.context.request);
        await b2.beat('마감되면 각자 자기 몫을 결제합니다. 총 만 원을 두 사람이 나눠 한 사람당 오천 원입니다. 예치금에서 바로 차감됩니다.', async () => {
            await openSharedPayment(b2.page, id);
            const share = await shareAmount(b2.page);
            await paySharedShare(b2.page);
            await expect(b2.page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(b2.context.request)).toBe(before2 - share);
        });
        await b2.close();

        // 5) 만든 사람 결제 → 확정
        const a3 = await s.open({ storageState: authFile('buyer1') });
        await a3.beat('마지막으로 만든 사람이 결제하면, 전원 결제가 끝나 공동 주문이 확정됩니다.', async () => {
            await openSharedPayment(a3.page, id);
            await paySharedShare(a3.page);
            await expect(a3.page.getByRole('heading', { name: '전원 결제 완료! 주문이 확정되었습니다' })).toBeVisible();
        });
        await a3.close();
    } finally {
        await s.save();
    }
});
