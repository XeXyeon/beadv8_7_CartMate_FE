import { expect, test } from '@playwright/test';
import { waitForMailCode, waitForPhoneCode } from '../../e2e/support/codes';
import { resolvePassword } from '../../e2e/support/config.mjs';
import { walletBalance } from '../../e2e/support/shop';
import { SELLER_STATE, newScene, rand } from '../support/shared';
import { writeWork } from '../support/narrate';

// E27 회원가입 → 메일 인증 로그인(이 기기 기억) → 예치금 0원. 가입한 회원이 이후 장면의 시연 판매자가 된다.
test('장면 01 회원가입 · 로그인 (E27)', async ({ browser, baseURL }) => {
    const m = { email: `cartmate.demo.${rand(6)}@example.test`, nickname: `시연상점${rand(3)}`, phone: `010-8${rand(3)}-${rand(4)}`, password: resolvePassword() };
    const s = newScene(1, 'E27', '회원가입 · 로그인', browser, baseURL);
    try {
        const n = await s.open();
        const page = n.page;
        await n.beat('첫 번째 기능은 회원가입입니다. 이메일을 입력하고 인증번호를 받아 본인 이메일을 확인합니다.', async () => {
            await page.goto('/signup');
            await page.locator('#reg-email').pressSequentially(m.email, { delay: 30 });
            const since = Date.now();
            await page.getByRole('button', { name: '인증번호 발송' }).first().click();
            await page.getByLabel('이메일 인증번호').fill(await waitForMailCode(m.email, since));
            await page.getByRole('button', { name: '인증확인' }).click();
            await expect(page.getByRole('button', { name: '인증완료' }).first()).toBeVisible();
        });
        await n.beat('비밀번호와 닉네임을 정하고, 닉네임 중복도 바로 확인할 수 있습니다.', async () => {
            await page.locator('#reg-password').fill(m.password);
            await page.locator('#reg-password-confirm').fill(m.password);
            await page.locator('#reg-nickname').pressSequentially(m.nickname, { delay: 40 });
            await page.getByRole('button', { name: '중복확인' }).click();
            await expect(page.getByRole('button', { name: '확인완료' })).toBeVisible();
        });
        await n.beat('휴대폰 번호도 인증번호로 확인합니다.', async () => {
            await page.locator('#reg-phone').fill(m.phone);
            const since = Date.now();
            await page.getByRole('button', { name: '인증번호 발송' }).click();
            await page.getByLabel('휴대폰 인증번호').fill(await waitForPhoneCode(m.phone, since));
            await page.getByRole('button', { name: '인증확인' }).last().click();
            await expect(page.getByRole('button', { name: '인증완료' })).toHaveCount(2);
        });
        await n.beat('생년월일을 입력하고 약관에 동의하면 가입이 끝납니다.', async () => {
            await page.locator('#reg-birth').fill('19950524');
            await page.locator('#agree-all').check();
            await page.getByRole('button', { name: '회원가입 완료' }).click();
            await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        });
        await n.beat('처음 로그인하는 기기에서는 이메일로 한 번 더 인증합니다. 이 기기를 기억하도록 선택하면, 다음부터는 추가 인증 없이 로그인됩니다.', async () => {
            await page.locator('#user-email').fill(m.email);
            await page.locator('#user-password').fill(m.password);
            const since = Date.now();
            await page.getByRole('button', { name: '로그인', exact: true }).click();
            await expect(page.locator('#mfa-code')).toBeVisible({ timeout: 30_000 });
            await page.locator('#mfa-code').fill(await waitForMailCode(m.email, since));
            const remember = page.getByRole('checkbox', { name: /이 기기 30일 동안 기억하기/ });
            if (!(await remember.isChecked())) await remember.check();
            await page.getByRole('button', { name: '인증하고 로그인' }).click();
            await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
        });
        await n.beat('가입 직후의 예치금은 0원입니다. 이제 서비스에서 쓸 예치금을 충전해 보겠습니다.', async () => {
            await page.goto('/mypage/deposit');
            await expect.poll(async () => walletBalance(page.request), { timeout: 20_000 }).toBe(0);
        });
        writeWork('member.json', m);
        await n.context.storageState({ path: SELLER_STATE });
        await n.close();
    } finally {
        await s.save();
    }
});
