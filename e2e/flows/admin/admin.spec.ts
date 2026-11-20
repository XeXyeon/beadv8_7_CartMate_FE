import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createSalesPost, mySellerId } from '../../support/admin-api';
import { createFreshMember, rememberTrustedDevice, submitFreshMemberLogin, type FreshMember } from '../../support/admin-member';
import { authFile } from '../../support/auth';
import { adminOtpSecret, resolvePassword } from '../../support/config.mjs';
import { withRunId } from '../../support/run';

// QA-4 관리자 흐름: E14 판매글 숨김 · E17 쿠폰 발급 중지 · E24 회원 정지 · E25 공지 · E26 탈퇴 신청/취소.
// 관리자는 setup이 만든 로그인 상태를 쓰고, 정지 · 탈퇴 · 쿠폰 받기 대상은 실행마다 새로 만든 회원이다(고정 구매자는 건드리지 않는다).
// 만드는 데이터(판매글 · 쿠폰 · 공지)는 제목에 runId를 붙여 자기 것만 찾는다.

test.skip(!adminOtpSecret(), '관리자 OTP 비밀키가 없어 건너뜁니다(npm run e2e:bootstrap).');
test.use({ storageState: authFile('admin') });

// confirm · alert 팝업은 모두 확인으로 넘긴다(발급 중지 · 삭제 · 정지 해제 확인창과 처리 완료 안내).
test.beforeEach(({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());
});

async function roleContext(browser: Browser, baseURL: string | undefined, role: 'buyer1' | 'seller' | null): Promise<BrowserContext> {
    // test.use의 관리자 로그인 상태를 물려받지 않게 항상 storageState를 직접 정한다.
    return browser.newContext({ baseURL, storageState: role ? authFile(role) : { cookies: [], origins: [] } });
}

async function freshMemberPage(browser: Browser, baseURL: string | undefined, member: FreshMember): Promise<{ context: BrowserContext; page: Page }> {
    const context = await roleContext(browser, baseURL, null);
    context.on('page', (p) => p.on('dialog', (dialog) => void dialog.accept())); // 탈퇴 취소 확인창 등
    const page = await submitFreshMemberLogin(context, member);
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
    await rememberTrustedDevice(context, member);
    return { context, page };
}

test('E14 관리자 판매글 숨김 → 구매 불가 → 해제', async ({ page, browser, baseURL }) => {
    const title = withRunId('E14 판매글');

    // 판매자 계정으로 판매글 하나를 만든다(등록 화면은 E05가 본다).
    const seller = await roleContext(browser, baseURL, 'seller');
    try {
        await createSalesPost(seller.request, await mySellerId(seller.request), title);
    } finally {
        await seller.close();
    }

    // 관리자 목록에서 제목으로 찾아 id를 읽는다. 숨김 개수는 실행 전 값과의 차이로 본다.
    await page.goto('/admin/posts');
    const hiddenCount = async () => {
        const text = await page.getByRole('button', { name: /관리자 숨김/ }).first().innerText();
        const n = Number(text.match(/([\d,]+)건/)?.[1].replace(/,/g, ''));
        if (Number.isNaN(n)) throw new Error(`숨김 개수를 읽지 못했습니다: ${text}`);
        return n;
    };
    await expect(page.getByText('불러오는 중…')).toHaveCount(0);
    const hiddenBefore = await hiddenCount();
    await page.getByLabel('판매글 제목 검색').fill(title);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    const link = page.getByRole('link', { name: title });
    await expect(link).toBeVisible();
    const postId = (await link.getAttribute('href'))?.match(/\/admin\/posts\/(\d+)/)?.[1];
    expect(postId, '판매글 id').toBeTruthy();

    // 숨기기 전: 구매자는 바로 구매할 수 있다.
    const buyer = await roleContext(browser, baseURL, 'buyer1');
    const buyerPage = await buyer.newPage();
    try {
        await buyerPage.goto(`/products/${postId}`);
        await expect(buyerPage.getByRole('heading', { name: title })).toBeVisible();
        await expect(buyerPage.getByRole('button', { name: '바로 구매' })).toBeEnabled();

        // 관리자: 숨기기
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/admin/posts/${postId}$`));
        await page.getByRole('button', { name: '판매글 숨기기' }).click();
        await page.getByRole('button', { name: '숨기기', exact: true }).click();
        await expect(page.getByText('관리자 숨김 상태입니다')).toBeVisible();
        await expect(page.getByRole('button', { name: '숨김 해제' })).toBeVisible();

        // 구매자: 상세에서 사라지고 구매할 수 없다.
        await buyerPage.reload();
        await expect(buyerPage.getByRole('heading', { name: '상품을 찾을 수 없습니다' })).toBeVisible();
        await expect(buyerPage.getByRole('button', { name: '바로 구매' })).toHaveCount(0);

        // 목록의 숨김 개수가 하나 늘었다.
        await page.goto('/admin/posts');
        await expect(page.getByText('불러오는 중…')).toHaveCount(0);
        await expect.poll(hiddenCount).toBe(hiddenBefore + 1);

        // 관리자: 해제
        await page.goto(`/admin/posts/${postId}`);
        await page.getByRole('button', { name: '숨김 해제' }).click();
        await page.getByRole('button', { name: '해제하기' }).click();
        await expect(page.getByRole('button', { name: '판매글 숨기기' })).toBeVisible();

        // 구매자: 다시 구매할 수 있다.
        await buyerPage.reload();
        await expect(buyerPage.getByRole('heading', { name: title })).toBeVisible();
        await expect(buyerPage.getByRole('button', { name: '바로 구매' })).toBeEnabled();
    } finally {
        await buyer.close();
    }
});

test('E17 쿠폰 발급 중지: 새로 받기 불가, 이미 받은 쿠폰은 그대로', async ({ page, browser, baseURL }) => {
    const name = withRunId('E17 쿠폰');
    const early = await createFreshMember('cpn');
    const late = await createFreshMember('cpn');

    // 관리자: 쿠폰 만들기(직접 받기 · 정액 1,000원)
    await page.goto('/admin/coupons');
    await page.getByRole('button', { name: '새 쿠폰 만들기' }).click();
    await page.getByLabel('쿠폰 이름').fill(name);
    await page.getByLabel('할인 금액 (원)').fill('1000');
    await page.getByRole('button', { name: '쿠폰 만들기', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByText('발급 중', { exact: true })).toBeVisible();

    // 발급 중지 전에 한 회원이 받는다.
    const first = await freshMemberPage(browser, baseURL, early);
    try {
        await first.page.goto('/mypage/coupons');
        // 눌러도 같은 카드가 잡히도록 이름으로만 좁힌다(받기 → 받음으로 버튼 이름이 바뀐다).
        const card = first.page.getByRole('region', { name: '받을 수 있는 쿠폰' }).locator('div').filter({ hasText: name }).filter({ has: first.page.getByRole('button', { name: /^(받기|받음)$/ }) }).last();
        await card.getByRole('button', { name: '받기', exact: true }).click();
        await expect(card.getByRole('button', { name: '받음' })).toBeVisible();
        await expect(first.page.getByRole('region', { name: '내 쿠폰' }).getByText(name)).toBeVisible();
    } finally {
        await first.context.close();
    }

    // 관리자: 발급 중지
    await page.reload();
    await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: '발급 중지' }).click();
    await expect(page.getByRole('row').filter({ hasText: name }).getByText('발급 중지', { exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: '발급 중지' })).toHaveCount(0);

    // 중지 뒤: 다른 회원은 받을 수 있는 쿠폰에서 못 찾는다.
    const second = await freshMemberPage(browser, baseURL, late);
    try {
        await second.page.goto('/mypage/coupons');
        const downloadable = second.page.getByRole('region', { name: '받을 수 있는 쿠폰' });
        // 목록이 실제로 온 뒤에 센다(로딩 중에도 region은 보인다): 카드의 '받기' 버튼이나 빈 목록 문구가 보일 때까지
        await expect(downloadable.getByRole('button', { name: /^(받기|받음|소진)$/ }).or(downloadable.getByText('지금 받을 수 있는 쿠폰이 없습니다.')).first()).toBeVisible();
        await expect(downloadable.getByText(name)).toHaveCount(0);
    } finally {
        await second.context.close();
    }

    // 이미 받은 회원의 쿠폰은 사용 가능 탭에 그대로 있다.
    const again = await freshMemberPage(browser, baseURL, early);
    try {
        await again.page.goto('/mypage/coupons');
        const mine = again.page.getByRole('region', { name: '내 쿠폰' });
        await expect(mine.getByText(name)).toBeVisible();
        await expect(mine.getByRole('tab', { name: /사용 가능 [1-9]/ })).toBeVisible();
    } finally {
        await again.context.close();
    }
});

test('E24 관리자 회원 정지 → 로그인 차단 → 해제', async ({ page, browser, baseURL }) => {
    const target = await createFreshMember('sus');

    // 관리자: 이메일로 찾아 상세로 간다.
    await page.goto('/admin/members');
    await page.getByLabel('검색어 입력').fill(target.email);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: target.email });
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: '상세보기' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/members/${target.id}$`));
    await expect(page.getByText('정상 회원', { exact: true }).first()).toBeVisible();

    // 정지(7일)
    await page.getByRole('link', { name: '회원 정지 처리' }).click();
    await page.getByLabel(/상세 사유 기록/).fill(`E2E 정지 확인 ${target.nickname}`);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '정지 처리 확정' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/members/${target.id}$`));
    await expect(page.getByText('정지 회원', { exact: true }).first()).toBeVisible();

    // 정지된 회원은 로그인할 수 없다.
    const blocked = await roleContext(browser, baseURL, null);
    try {
        const blockedPage = await submitFreshMemberLogin(blocked, target);
        await expect(blockedPage.locator('form [role="alert"]').first()).toBeVisible();
        await expect(blockedPage).toHaveURL(/\/login/);
        await rememberTrustedDevice(blocked, target);
    } finally {
        await blocked.close();
    }

    // 정지 해제 → 다시 로그인된다.
    await page.getByRole('button', { name: '정지 해제' }).click();
    await expect(page.getByText('정상 회원', { exact: true }).first()).toBeVisible();
    const back = await freshMemberPage(browser, baseURL, target);
    try {
        await expect(back.page).not.toHaveURL(/\/login/);
    } finally {
        await back.context.close();
    }
});

test('E25 공지 작성 → 고객센터 노출 → 수정 · 삭제', async ({ page, browser, baseURL }) => {
    const title = withRunId('E25 공지');
    const edited = withRunId('E25 공지(수정)');
    const content = `${title} 본문입니다.`;

    // 관리자: 작성(상단 고정)
    await page.goto('/admin/notices');
    await page.getByRole('button', { name: '새 공지 작성' }).click();
    await page.getByLabel('공지 제목', { exact: true }).fill(title);
    await page.getByLabel('공지 내용', { exact: true }).fill(content);
    await page.getByLabel('상단 고정').check();
    await page.getByRole('button', { name: '등록', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();

    // 사용자 화면(비로그인): 고객센터 공지에서 제목으로 찾아 펼치면 본문이 보인다.
    const visitor = await roleContext(browser, baseURL, null);
    const user = await visitor.newPage();
    const findOnUserBoard = async (keyword: string) => {
        await user.goto('/notices');
        await user.getByLabel('공지사항 검색').fill(keyword);
        await user.getByRole('button', { name: '검색', exact: true }).click();
    };
    try {
        await findOnUserBoard(title);
        await user.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
        await expect(user.getByText(content)).toBeVisible();

        // 관리자: 수정
        await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: '수정' }).click();
        await expect(page.getByLabel('공지 제목', { exact: true })).toHaveValue(title);
        await page.getByLabel('공지 제목', { exact: true }).fill(edited);
        await page.getByRole('button', { name: '수정 완료' }).click();
        await expect(page.getByRole('row').filter({ hasText: edited })).toBeVisible();

        await findOnUserBoard(edited);
        await expect(user.getByRole('button', { name: /E25 공지\(수정\)/ })).toBeVisible();
        await findOnUserBoard(title);
        await expect(user.getByText(/에 해당하는 공지가 없습니다/)).toBeVisible();

        // 관리자: 삭제
        await page.getByRole('row').filter({ hasText: edited }).getByRole('button', { name: '삭제' }).click();
        await expect(page.getByRole('row').filter({ hasText: edited })).toHaveCount(0);
        await findOnUserBoard(edited);
        await expect(user.getByText(/에 해당하는 공지가 없습니다/)).toBeVisible();
    } finally {
        await visitor.close();
    }
});

test('E26 탈퇴 신청 → 취소', async ({ page, browser, baseURL }) => {
    const target = await createFreshMember('wd');
    const { context, page: member } = await freshMemberPage(browser, baseURL, target);
    try {
        await member.goto('/mypage/profile');
        await member.getByRole('button', { name: '회원 탈퇴 신청' }).click();
        // 같은 화면의 비밀번호 변경 폼과 구분하려고 탈퇴 신청 모달 안에서만 찾는다.
        const modal = member.locator('form').filter({ hasText: '위 안내를 확인했으며 탈퇴를 신청합니다.' });
        await modal.locator('input[type="password"]').fill(resolvePassword());
        await modal.getByLabel('위 안내를 확인했으며 탈퇴를 신청합니다.').check();
        await modal.getByRole('button', { name: '탈퇴 신청', exact: true }).click();
        await expect(member.getByText('탈퇴 대기 중입니다')).toBeVisible();

        // 관리자 화면에서도 탈퇴 대기로 보인다.
        await page.goto(`/admin/members/${target.id}`);
        await expect(page.getByText('탈퇴 대기 회원', { exact: true }).first()).toBeVisible();

        // 취소 → 다시 신청할 수 있는 상태, 관리자 화면은 정상 회원
        await member.getByRole('button', { name: '탈퇴 취소' }).click();
        await expect(member.getByRole('button', { name: '회원 탈퇴 신청' })).toBeVisible();
        await expect(member.getByText('탈퇴 대기 중입니다')).toHaveCount(0);
        await page.reload();
        await expect(page.getByText('정상 회원', { exact: true }).first()).toBeVisible();
    } finally {
        await context.close();
    }
});
