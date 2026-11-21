import { expect, test, type Page } from '@playwright/test';
import { createFreshMember, rememberTrustedDevice } from '../../e2e/support/admin-member';
import { authFile, resolveBaseUrl, resolvePassword } from '../../e2e/support/config.mjs';
import { createDemoPost, productImage } from '../support/data';
import { SELLER_STATE, newScene, sellerApi } from '../support/shared';

// E14 관리자 판매글 숨김 → 구매 불가 → 해제, E24 회원 정지 → 로그인 차단 → 해제.
test('장면 13 관리자 운영 (E14 · E24)', async ({ browser, baseURL, playwright }) => {
    const seller = await sellerApi(playwright, baseURL);
    const title = '여름 한정 러닝 모자';
    const post = await createDemoPost(seller, { title, name: title, price: 15_000, image: await productImage(browser, '🧢', title, '#ddd6fe') });
    await seller.storageState({ path: SELLER_STATE }).catch(() => {});
    await seller.dispose();
    const target = await createFreshMember('demo');
    const s = newScene(13, 'E14·E24', '관리자 운영', browser, baseURL);
    try {
        const a = await s.open({ storageState: authFile('admin') });
        const ap = a.page;
        const postLink = ap.locator(`a[href="/admin/posts/${post.postId}"]`, { hasText: title }); // 같은 제목이 남아 있어도 이번 판매글만
        await a.beat('관리자 화면에서는 서비스 운영을 관리합니다. 먼저 판매글 관리에서 제목으로 판매글을 찾습니다.', async () => {
            await ap.goto('/admin/posts');
            await expect(ap.getByText('불러오는 중…')).toHaveCount(0);
            await ap.getByLabel('판매글 제목 검색').fill(title);
            await ap.getByRole('button', { name: '검색', exact: true }).click();
            await expect(postLink).toBeVisible();
        });
        await a.beat('운영 정책에 맞지 않는 판매글은 상세에서 숨김 처리할 수 있습니다.', async () => {
            await postLink.click();
            await expect(ap).toHaveURL(new RegExp(`/admin/posts/${post.postId}$`));
            await ap.getByRole('button', { name: '판매글 숨기기' }).click();
            await ap.getByRole('button', { name: '숨기기', exact: true }).click();
            await expect(ap.getByText('관리자 숨김 상태입니다')).toBeVisible();
        });
        await a.close();

        const b = await s.open();
        await b.beat('숨김 처리된 판매글은 구매자에게 더 이상 보이지 않고, 구매할 수도 없습니다.', async () => {
            await b.page.goto(`/products/${post.postId}`);
            await expect(b.page.getByRole('heading', { name: '상품을 찾을 수 없습니다' })).toBeVisible();
        });
        await b.close();

        const c = await s.open({ storageState: authFile('admin') });
        const cp = c.page;
        await c.beat('숨김을 해제하면 판매글이 다시 정상으로 노출됩니다.', async () => {
            await cp.goto(`/admin/posts/${post.postId}`);
            await cp.getByRole('button', { name: '숨김 해제' }).click();
            await cp.getByRole('button', { name: '해제하기' }).click();
            await expect(cp.getByRole('button', { name: '판매글 숨기기' })).toBeVisible();
        });
        await c.beat('회원 관리에서는 이메일로 회원을 찾아 상세 정보를 볼 수 있습니다.', async () => {
            await cp.goto('/admin/members');
            await cp.getByLabel('검색어 입력').fill(target.email);
            await cp.getByRole('button', { name: '검색', exact: true }).click();
            const row = cp.getByRole('row').filter({ hasText: target.email });
            await expect(row).toBeVisible();
            await row.getByRole('link', { name: '상세보기' }).click();
            await expect(cp).toHaveURL(new RegExp(`/admin/members/${target.id}$`));
            await expect(cp.getByText('정상 회원', { exact: true }).first()).toBeVisible();
        });
        await c.beat('문제가 있는 회원은 정지 기간과 사유를 기록하고 정지할 수 있습니다.', async () => {
            await cp.getByRole('link', { name: '회원 정지 처리' }).click();
            await cp.getByLabel(/상세 사유 기록/).fill('시연: 운영 정책 위반 신고 접수');
            await cp.getByRole('checkbox').check();
            await cp.getByRole('button', { name: '정지 처리 확정' }).click();
            await expect(cp).toHaveURL(new RegExp(`/admin/members/${target.id}$`));
            await expect(cp.getByText('정지 회원', { exact: true }).first()).toBeVisible();
        });
        await c.close();

        const d = await s.open();
        await d.beat('정지된 회원은 올바른 비밀번호로도 로그인할 수 없습니다.', async () => {
            await loginFresh(d.context, d.page, target.email, target.trustedToken);
            await expect(d.page.locator('form [role="alert"]').first()).toBeVisible();
            await expect(d.page).toHaveURL(/\/login/);
            await rememberTrustedDevice(d.context, target);
        });
        await d.close();

        const e = await s.open({ storageState: authFile('admin') });
        await e.beat('정지를 해제하면 회원은 다시 정상적으로 이용할 수 있습니다..', async () => {
            await e.page.goto(`/admin/members/${target.id}`);
            await e.page.getByRole('button', { name: '정지 해제' }).click();
            await expect(e.page.getByText('정상 회원', { exact: true }).first()).toBeVisible();
        });
        await e.close();
    } finally {
        await s.save();
    }
});

async function loginFresh(context: import('@playwright/test').BrowserContext, page: Page, email: string, token: string) {
    const base = resolveBaseUrl();
    await context.addCookies([{ name: 'trustedDevice', value: token, domain: base.hostname, path: '/api/auth', expires: Math.floor(Date.now() / 1000) + 29 * 86_400, httpOnly: true, secure: base.isHttps, sameSite: 'Lax' }]);
    await page.goto('/login');
    await page.locator('#user-email').fill(email);
    await page.locator('#user-password').fill(resolvePassword());
    await page.getByRole('button', { name: '로그인', exact: true }).click();
}
