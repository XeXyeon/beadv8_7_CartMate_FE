import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { resolvePassword } from '../../support/config.mjs';
import { waitForMailCode, waitForPhoneCode } from '../../support/codes';
import { runId } from '../../support/run';
import { createPost, walletBalance } from '../../support/shop';

// QA-3 신규 회원 여정: 가입(E27) → 휴대폰 번호 변경(E28) → 판매자 신청(E29).
// 계정은 실행마다 새로 만들고(이메일 · 번호 · 닉네임 무작위) 앞 단계의 결과를 다음 단계가 쓰므로 한 줄로(serial) 돈다.
// 로컬 도커 환경 전용이다(인증 코드를 member 컨테이너 로그에서 읽는다).

const rand = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const EMAIL = `e2e-signup-${runId()}-${rand(3)}@example.test`;
const NICK = `가입${rand(6)}`;
const PHONE = `010-8${rand(3)}-${rand(4)}`;
const NEW_PHONE = `010-7${rand(3)}-${rand(4)}`;
const PASSWORD = resolvePassword();

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
    context = await browser.newContext(); // 비로그인 · 신뢰 기기 없음
    page = await context.newPage();
    page.on('dialog', (d) => void d.accept());
});
test.afterAll(async () => {
    await context.close();
});

test('E27 회원가입 → 첫 로그인은 메일 인증(이 기기 기억) → 다음 로그인은 인증 없이 → 예치금 0원', async ({ playwright, baseURL }) => {
    await page.goto('/signup');

    // 이메일 인증
    await page.locator('#reg-email').fill(EMAIL);
    let since = Date.now();
    await page.getByRole('button', { name: '인증번호 발송' }).first().click();
    await page.getByLabel('이메일 인증번호').fill(await waitForMailCode(EMAIL, since));
    await page.getByRole('button', { name: '인증확인' }).click();
    await expect(page.getByRole('button', { name: '인증완료' }).first()).toBeVisible();

    await page.locator('#reg-password').fill(PASSWORD);
    await page.locator('#reg-password-confirm').fill(PASSWORD);
    await page.locator('#reg-nickname').fill(NICK);
    await page.getByRole('button', { name: '중복확인' }).click();
    await expect(page.getByRole('button', { name: '확인완료' })).toBeVisible();

    // 휴대폰 인증
    await page.locator('#reg-phone').fill(PHONE);
    since = Date.now();
    await page.getByRole('button', { name: '인증번호 발송' }).click();
    await page.getByLabel('휴대폰 인증번호').fill(await waitForPhoneCode(PHONE, since));
    await page.getByRole('button', { name: '인증확인' }).last().click();
    await expect(page.getByRole('button', { name: '인증완료' })).toHaveCount(2);

    await page.locator('#reg-birth').fill('19950524');
    await page.locator('#agree-all').check();
    await page.getByRole('button', { name: '회원가입 완료' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    // 첫 로그인: 신뢰 기기가 없어 메일 인증을 거친다. "이 기기 기억"을 켜 둔다
    await page.locator('#user-email').fill(EMAIL);
    await page.locator('#user-password').fill(PASSWORD);
    since = Date.now();
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.locator('#mfa-code')).toBeVisible({ timeout: 30_000 });
    await page.locator('#mfa-code').fill(await waitForMailCode(EMAIL, since));
    const remember = page.getByRole('checkbox', { name: /이 기기 30일 동안 기억하기/ });
    if (!(await remember.isChecked())) await remember.check();
    await page.getByRole('button', { name: '인증하고 로그인' }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    // 예치금은 0원
    await expect.poll(async () => walletBalance(page.request), { timeout: 20_000 }).toBe(0);

    // 신뢰 기기 쿠키만 가진 새 브라우저로 다시 로그인하면 2차 인증이 없다
    const trusted = (await context.cookies()).filter((c) => c.name === 'trustedDevice');
    expect(trusted.length).toBe(1);
    const again = await context.browser()!.newContext({ baseURL: baseURL!, storageState: { cookies: trusted, origins: [] } });
    const p2 = await again.newPage();
    await p2.goto('/login');
    await p2.locator('#user-email').fill(EMAIL);
    await p2.locator('#user-password').fill(PASSWORD);
    await p2.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(p2).not.toHaveURL(/\/login/, { timeout: 60_000 });
    await expect(p2.locator('#mfa-code')).toHaveCount(0);
    // 로그인 때 신뢰 기기 쿠키가 회전했으므로 이후 단계는 이 컨텍스트가 아니라 처음 컨텍스트를 계속 쓴다(처음 컨텍스트의 쿠키는 그대로 유효)
    await again.close();
    void playwright;
});

test('E28 휴대폰 번호 변경: 틀린 인증번호는 거절하고, 맞는 인증번호로 저장한다', async () => {
    await page.goto('/mypage/profile');
    await expect(page.locator('#profile-phone')).toHaveValue(PHONE);

    await page.waitForLoadState('networkidle');
    // 프로필을 다시 불러오면 입력칸이 원래 번호로 되돌아가 "인증" 버튼이 꺼진다(QA-5 실행에서 한 번 실패). 번호가 남고 버튼이 켜질 때까지 다시 채운다
    const sendButton = page.getByRole('button', { name: '인증', exact: true });
    await expect(async () => {
        await page.locator('#profile-phone').fill(NEW_PHONE);
        await expect(sendButton).toBeEnabled({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    const since = Date.now();
    await sendButton.click();
    const code = await waitForPhoneCode(NEW_PHONE, since);

    // 틀린 번호
    const wrong = code === '000000' ? '111111' : '000000';
    const dialogs: string[] = [];
    page.on('dialog', (d) => dialogs.push(d.message()));
    await page.getByPlaceholder('인증번호 6자리').fill(wrong);
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await expect.poll(() => dialogs.length).toBeGreaterThan(0);
    await expect(page.getByText('휴대폰 인증이 완료되었습니다.')).toHaveCount(0);

    // 맞는 번호 → 저장
    await page.getByPlaceholder('인증번호 6자리').fill(code);
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByText('휴대폰 인증이 완료되었습니다.')).toBeVisible();
    await page.getByRole('button', { name: '변경사항 저장' }).click();
    await expect.poll(() => dialogs.some((m) => m.includes('변경사항이 저장되었습니다'))).toBe(true);

    await page.reload();
    await expect(page.locator('#profile-phone')).toHaveValue(NEW_PHONE);
});

test('E29 판매자 신청: 계좌 확인 불일치는 막고, 통과하면 판매자가 된다', async () => {
    await page.goto('/mypage/seller-apply');
    await page.getByText('개인 판매자').click();
    await page.locator('#seller-phone').fill(NEW_PHONE);
    await page.locator('#seller-bank').selectOption('국민은행');
    await page.locator('#seller-holder').fill('신규판매자');

    // 끝자리 0000은 예금주 불일치로 거절된다(로컬 환경의 fake 오픈뱅킹 규칙)
    await page.locator('#seller-account').fill(`1002${rand(8)}0000`);
    await page.getByRole('button', { name: '계좌 확인' }).click();
    await expect(page.getByText('계좌 확인에 실패했습니다').or(page.locator('span.text-error').first())).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '판매자 등록하기' }).click();
    await expect(page.getByText('정산 계좌 확인을 해주세요.')).toBeVisible();

    // 올바른 계좌
    await page.locator('#seller-account').fill(`1002${rand(8)}1234`);
    await page.getByRole('button', { name: '계좌 확인' }).click();
    await expect(page.getByRole('button', { name: '확인완료' })).toBeVisible();
    await page.getByRole('button', { name: '판매자 등록하기' }).click();
    await expect(page.getByText('판매자 (활성)')).toBeVisible({ timeout: 30_000 });

    // 판매자 센터가 열리고 판매글을 등록할 수 있다
    await page.goto('/seller');
    await expect(page).toHaveURL(/\/seller$/);
    const post = await createPost(page.request, { name: 'E29 판매글', price: 15_000 });
    expect(post.postId).toBeGreaterThan(0);
});
