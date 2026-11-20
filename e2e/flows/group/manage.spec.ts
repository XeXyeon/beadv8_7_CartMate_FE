import { expect, test } from '@playwright/test';
import { authFile } from '../../support/auth';
import { withRunId } from '../../support/run';
import { addSharedItem, headcount, closePeople, closeSharedGroup, createPost, createSharedGroup, joinByInvite, openPerson, openSharedPayment, releaseAbuse, invitePath, type Person } from '../../support/group-helpers';

// E22 — N빵 관리(나가기 · 강퇴 · 인원 늘리기 · 다시 만들기)와 가득 찬 · 마감된 초대 링크.
// 만든 사람 = e2e-buyer1, 참여자 = e2e-buyer2, 세 번째 사람 = e2e-target(가입만 쓰고 돈은 쓰지 않는다).

const FULL = '참여 인원이 가득 찼습니다';
const CLOSED = '수정 기간이 끝났거나 이미 마감·취소된 공동구매라 참여할 수 없습니다';

test.describe('N빵 관리', () => {
    // 공동구매 남용 제한이 걸려 있으면 풀고 시작한다(취소 · 나가기를 되풀이하는 흐름)
    test.beforeEach(async ({ playwright, baseURL }) => {
        await releaseAbuse(playwright, baseURL, ['buyer1', 'buyer2', 'target']);
    });

    test('E22-1 가득 찬 초대 링크 → 인원 늘리기 → 참여 → 나가기 · 강퇴 → 취소 → 다시 만들기', async ({ browser, baseURL }) => {
        let creator: Person | undefined;
        let member: Person | undefined;
        let third: Person | undefined;
        try {
            creator = await openPerson(browser, baseURL, 'buyer1');
            member = await openPerson(browser, baseURL, 'buyer2');
            third = await openPerson(browser, baseURL, 'target');

            const title = withRunId('E22 관리 N빵');
            const { id, code } = await createSharedGroup(creator.page, title, 2);
            await joinByInvite(member.page, id, code);

            // 권한: 참여자는 나가기만, 만든 사람은 마감 · 인원 늘리기 · 취소(나가기는 없음)
            await expect(member.page.getByRole('button', { name: '공동구매 나가기' })).toBeVisible();
            await expect(member.page.getByRole('button', { name: '공동구매 취소' })).toHaveCount(0);
            await expect(member.page.getByRole('button', { name: '최대 인원 늘리기' })).toHaveCount(0);
            await expect(member.page.getByRole('button', { name: /내보내기$/ })).toHaveCount(0);
            await creator.page.goto(`/group-purchases/${id}`);
            await expect(headcount(creator.page, '2명 / 최대 2명')).toBeVisible();
            await expect(creator.page.getByRole('button', { name: '최대 인원 늘리기' })).toBeVisible();
            await expect(creator.page.getByRole('button', { name: '공동구매 취소' })).toBeVisible();
            await expect(creator.page.getByRole('button', { name: '공동구매 나가기' })).toHaveCount(0);

            // 가득 찬 링크: 세 번째 사람은 거절 안내
            await third.page.goto(invitePath(id, code));
            await third.page.getByRole('button', { name: '공동구매 참여하기' }).click();
            await expect(third.page.getByRole('alert').filter({ hasText: FULL })).toBeVisible();

            // 인원 늘리기(2 → 3) 뒤에는 같은 링크로 참여된다
            await creator.page.getByRole('button', { name: '최대 인원 늘리기' }).click();
            await creator.page.getByRole('spinbutton').fill('3');
            await creator.page.getByRole('button', { name: '늘리기', exact: true }).click();
            await expect(headcount(creator.page, '2명 / 최대 3명')).toBeVisible();
            await third.page.getByRole('button', { name: '공동구매 참여하기' }).click();
            await third.page.waitForURL(new RegExp(`/group-purchases/${id}$`));
            await creator.page.reload();
            await expect(headcount(creator.page, '3명 / 최대 3명')).toBeVisible();

            // 참여자 나가기 → 목록으로, 만든 사람 화면에서 인원이 줄어든다
            await member.page.getByRole('button', { name: '공동구매 나가기' }).click();
            await member.page.waitForURL(/\/group-purchases$/);
            await creator.page.reload();
            await expect(headcount(creator.page, '2명 / 최대 3명')).toBeVisible();

            // 만든 사람이 세 번째 사람을 강퇴 → 그 사람은 더 이상 볼 수 없다
            await creator.page.getByRole('button', { name: 'e2e-target 내보내기' }).click();
            await expect(headcount(creator.page, '1명 / 최대 3명')).toBeVisible();
            await third.page.goto(`/group-purchases/${id}`);
            await expect(third.page.getByRole('heading', { name: /참여한 사람만 볼 수 있는 공동구매입니다/ })).toBeVisible();

            // 만든 사람이 취소 → 같은 링크는 "마감 · 취소" 안내
            await creator.page.getByRole('button', { name: '공동구매 취소' }).click();
            await expect(creator.page.getByRole('button', { name: '같은 구성으로 다시 만들기' })).toBeVisible();
            await member.page.goto(invitePath(id, code));
            await member.page.getByRole('button', { name: '공동구매 참여하기' }).click();
            await expect(member.page.getByRole('alert').filter({ hasText: CLOSED })).toBeVisible();

            // 다시 만들기 → 새 공동구매의 생성 완료 화면(다른 id)
            await creator.page.getByRole('button', { name: '같은 구성으로 다시 만들기' }).click();
            await creator.page.waitForURL(/\/group-purchases\/new\/complete\?id=\d+/);
            expect(Number(new URL(creator.page.url()).searchParams.get('id'))).not.toBe(id);
        } finally {
            await closePeople(creator, member, third);
        }
    });

    test('E22-2 마감된 초대 링크는 참여할 수 없다', async ({ browser, baseURL, playwright }) => {
        let creator: Person | undefined;
        let member: Person | undefined;
        const seller = await playwright.request.newContext({ baseURL, storageState: authFile('seller') });
        try {
            const post = await createPost(seller, { name: `엔빵 상품 E22 ${Date.now()}`, price: 10_000 });
            creator = await openPerson(browser, baseURL, 'buyer1');
            member = await openPerson(browser, baseURL, 'buyer2');

            const { id, code } = await createSharedGroup(creator.page, withRunId('E22 마감 N빵'), 2);
            await addSharedItem(creator.page, id, post, 1);
            await closeSharedGroup(creator.page, id);

            await member.page.goto(invitePath(id, code));
            await member.page.getByRole('button', { name: '공동구매 참여하기' }).click();
            await expect(member.page.getByRole('alert').filter({ hasText: CLOSED })).toBeVisible();

            // 뒷정리: 결제 대기로 남지 않게 만든 사람이 공동 주문을 취소한다
            await openSharedPayment(creator.page, id);
            await creator.page.getByRole('button', { name: '공동 주문 취소' }).click();
            await expect(creator.page.getByRole('heading', { name: '취소된 공동 주문입니다' })).toBeVisible();
        } finally {
            await closePeople(creator, member);
            await seller.dispose();
        }
    });
});
