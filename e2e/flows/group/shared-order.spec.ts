import { expect, test } from '@playwright/test';
import { withRunId } from '../../support/run';
import {
    addSharedItem,
    closePeople,
    closeSharedGroup,
    createPost,
    createSharedGroup,
    headcount,
    joinByInvite,
    openPerson,
    openSharedPayment,
    paySharedShare,
    requireBalance,
    shareAmount,
    walletBalance,
    type Person,
} from '../../support/group-helpers';
import { authFile } from '../../support/auth';

// E10 · E11 — 공동물품(N빵): 생성 → 초대 → 담기 → 마감 → 분담금 결제 / 결제 중 만든 사람 취소.
// E10: 만든 사람 = e2e-buyer1, 참여자 = e2e-buyer2(둘 다 결제). E11: 만든 사람 = e2e-buyer2(결제 안 함), 참여자 = e2e-buyer1(결제 후 환불).
// 잔액은 실행 전 값과의 차이로 확인한다.

const PRICE = 10_000; // 2명이 나누면 5,000원씩

test.describe('N빵 공동 주문', () => {
    test('E10 N빵 생성 → 초대 → 담기 → 마감 → 분담금 결제 → 공동 주문 확정', async ({ browser, baseURL, playwright }) => {
        let creator: Person | undefined;
        let member: Person | undefined;
        const seller = await playwright.request.newContext({ baseURL, storageState: authFile('seller') });
        try {
            const post = await createPost(seller, { name: `엔빵 상품 E10 ${Date.now()}`, price: PRICE });
            creator = await openPerson(browser, baseURL, 'buyer1');
            member = await openPerson(browser, baseURL, 'buyer2');
            const creatorBefore = await requireBalance(creator, PRICE);
            const memberBefore = await requireBalance(member, PRICE);

            // 만든 사람: 생성 → 초대 코드
            const title = withRunId('E10 N빵');
            const { id, code } = await createSharedGroup(creator.page, title, 2);

            // 참여자: 초대 링크로 참여 → 상세에서 참여자 2명 확인 → 담기
            await joinByInvite(member.page, id, code);
            await expect(member.page.getByRole('heading', { name: title })).toBeVisible();
            await addSharedItem(member.page, id, post, 1);

            // 만든 사람: 상세에서 참여자 · 담긴 상품 확인 → 마감
            await creator.page.goto(`/group-purchases/${id}`);
            await expect(headcount(creator.page, '2명 / 최대 2명')).toBeVisible();
            await expect(creator.page.getByText(post.productName).first()).toBeVisible();
            await closeSharedGroup(creator.page, id);

            // 참여자 먼저 결제 → 대기 화면, 잔액이 분담금만큼 빠진다
            await openSharedPayment(member.page, id);
            const memberShare = await shareAmount(member.page);
            await paySharedShare(member.page);
            await expect(member.page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(member.context.request)).toBe(memberBefore - memberShare);

            // 만든 사람이 마지막으로 결제 → 전원 결제로 확정
            await openSharedPayment(creator.page, id);
            const creatorShare = await shareAmount(creator.page);
            expect(memberShare + creatorShare).toBe(PRICE);
            await paySharedShare(creator.page);
            await expect(creator.page.getByRole('heading', { name: '전원 결제 완료! 주문이 확정되었습니다' })).toBeVisible();
            expect(await walletBalance(creator.context.request)).toBe(creatorBefore - creatorShare);

            // 참여자 화면도 확정으로 바뀐다
            await member.page.reload();
            await expect(member.page.getByRole('heading', { name: '전원 결제 완료! 주문이 확정되었습니다' })).toBeVisible();
        } finally {
            await closePeople(creator, member);
            await seller.dispose();
        }
    });

    test('E11 N빵 결제 중 만든 사람이 취소하면 결제한 참여자에게 환불된다', async ({ browser, baseURL, playwright }) => {
        let creator: Person | undefined;
        let member: Person | undefined;
        const seller = await playwright.request.newContext({ baseURL, storageState: authFile('seller') });
        try {
            const post = await createPost(seller, { name: `엔빵 상품 E11 ${Date.now()}`, price: PRICE });
            creator = await openPerson(browser, baseURL, 'buyer2');
            member = await openPerson(browser, baseURL, 'buyer1');
            await requireBalance(creator, 0);
            const memberBefore = await requireBalance(member, PRICE);

            const { id, code } = await createSharedGroup(creator.page, withRunId('E11 N빵'), 2);
            await joinByInvite(member.page, id, code);
            await addSharedItem(member.page, id, post, 1);
            await closeSharedGroup(creator.page, id);

            // 참여자만 결제한다(만든 사람은 아직 결제 전)
            await openSharedPayment(member.page, id);
            const share = await shareAmount(member.page);
            await paySharedShare(member.page);
            await expect(member.page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible();
            expect(await walletBalance(member.context.request)).toBe(memberBefore - share);

            // 만든 사람이 결제 화면에서 공동 주문을 취소
            await openSharedPayment(creator.page, id);
            await creator.page.getByRole('button', { name: '공동 주문 취소' }).click();
            await expect(creator.page.getByRole('heading', { name: '취소된 공동 주문입니다' })).toBeVisible();

            // 결제한 참여자: 취소 화면 + 분담금이 예치금으로 돌아온다(결제 서버가 비동기로 환불)
            await member.page.reload();
            await expect(member.page.getByRole('heading', { name: '취소된 공동 주문입니다' })).toBeVisible();
            await expect.poll(() => walletBalance(member!.context.request), { timeout: 45_000, intervals: [1_000] }).toBe(memberBefore);
        } finally {
            await closePeople(creator, member);
            await seller.dispose();
        }
    });

    // FE 화면 문제(이슈 QA-5#1): 마감 뒤 상세(ORDER_CREATED)에 "내 몫 결제하기" 링크가 없고 "취소된 공동구매"라고 안내한다. 고쳐지면 fixme를 푼다.
    test.fixme('E10-상세 마감한 N빵 상세에서 "내 몫 결제하기"로 결제 화면에 갈 수 있다', async ({ browser, baseURL, playwright }) => {
        let creator: Person | undefined;
        const seller = await playwright.request.newContext({ baseURL, storageState: authFile('seller') });
        try {
            const post = await createPost(seller, { name: `엔빵 상품 E10D ${Date.now()}`, price: PRICE });
            creator = await openPerson(browser, baseURL, 'buyer1');
            const { id } = await createSharedGroup(creator.page, withRunId('E10 상세 링크'), 2);
            await addSharedItem(creator.page, id, post, 1);
            await closeSharedGroup(creator.page, id);
            await expect(creator.page.getByText('취소된 공동구매입니다')).toHaveCount(0);
            await creator.page.getByRole('link', { name: '내 몫 결제하기' }).click();
            await expect(creator.page).toHaveURL(/\/checkout\/shared\?order=\d+/);
        } finally {
            await closePeople(creator);
            await seller.dispose();
        }
    });
});
