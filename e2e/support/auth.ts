import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { ACCOUNTS, AUTH_DIR, authFile, resolvePassword, type AccountKey } from './config.mjs';
import { totpCode, totpMillisToNextStep, totpStep } from './totp';

export type { AccountKey };
export { authFile };

const BOOTSTRAP_HINT = '신뢰 기기 쿠키를 다시 만들려면 `npm run e2e:bootstrap -- --apply`를 사람이 실행하세요.';
const ADMIN_STEP_FILE = path.join(AUTH_DIR, 'admin-otp-step.txt');

type StoredCookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];

function readTrustedDeviceCookie(key: AccountKey): StoredCookie {
    const file = authFile(key);
    if (!existsSync(file)) throw new Error(`${key}: 로그인 준비 파일(e2e/.auth/${key}.json)이 없습니다. ${BOOTSTRAP_HINT}`);
    const state = JSON.parse(readFileSync(file, 'utf8')) as { cookies?: StoredCookie[] };
    const cookie = state.cookies?.find((c) => c.name === 'trustedDevice');
    if (!cookie) throw new Error(`${key}: 파일에 신뢰 기기 쿠키가 없습니다. ${BOOTSTRAP_HINT}`);
    return cookie;
}

/** 파일은 임시 파일에 쓴 뒤 바꿔서 중간에 끊겨도 반쯤 쓴 파일이 남지 않게 한다. */
function writeAuthFile(key: AccountKey, content: string) {
    mkdirSync(AUTH_DIR, { recursive: true });
    const file = authFile(key);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, content, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
}

async function submitCredentials(page: Page, key: AccountKey) {
    await page.goto('/login');
    await page.locator('#user-email').fill(ACCOUNTS[key].email);
    await page.locator('#user-password').fill(resolvePassword());
    await page.getByRole('button', { name: '로그인', exact: true }).click();
}

/** 로그인 화면을 벗어났는지, 2차 인증 입력이 떴는지, 오류가 떴는지 중 먼저 오는 것을 기다린다. */
async function waitLoginOutcome(page: Page): Promise<'done' | 'mfa' | { error: string }> {
    const outcome = await Promise.race([
        page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }).then(() => 'done' as const),
        page.locator('#mfa-code').waitFor({ timeout: 30_000 }).then(() => 'mfa' as const),
        page.locator('form [role="alert"]').first().waitFor({ timeout: 30_000 }).then(async () => ({ error: (await page.locator('form [role="alert"]').first().innerText()).trim() })),
    ]);
    return outcome;
}

/**
 * 저장된 신뢰 기기 쿠키로 UI 로그인하고, BE가 회전시킨 쿠키까지 포함한 storageState를 e2e/.auth/<계정>.json에 다시 저장한다.
 * 회전하면 옛 쿠키는 못 쓰므로, 테스트 안에서 UI 로그인을 다시 할 때도 이 함수를 써서 파일을 최신으로 유지한다.
 * 관리자는 신뢰 기기를 쓰지 않고 OTP 앱 코드(E2E_ADMIN_OTP_SECRET)로 로그인한다.
 */
export async function loginAndSaveState(context: BrowserContext, key: AccountKey): Promise<void> {
    const isAdmin = ACCOUNTS[key].role === 'ADMIN';
    const page = await context.newPage();
    let saved = false;
    try {
        const stored = isAdmin ? null : readTrustedDeviceCookie(key);
        if (stored) await context.addCookies([stored]);
        await submitCredentials(page, key);
        const outcome = await waitLoginOutcome(page);

        if (typeof outcome === 'object') throw new Error(`${key}: 로그인 실패 — ${outcome.error}`);
        if (outcome === 'mfa') {
            if (!isAdmin) throw new Error(`${key}: 신뢰 기기가 거절돼 메일 인증을 요구합니다(30일 만료 등). ${BOOTSTRAP_HINT}`);
            await submitAdminOtp(page);
        } else if (isAdmin && new URL(page.url()).pathname.startsWith('/otp-setup')) {
            throw new Error('admin: OTP가 아직 등록되지 않았습니다. 사람이 e2e-admin으로 OTP를 등록하고 E2E_ADMIN_OTP_SECRET을 적으세요.');
        }

        await page.waitForLoadState('load');
        const state = await context.storageState();
        if (!isAdmin && !state.cookies.some((c) => c.name === 'trustedDevice')) {
            throw new Error(`${key}: 로그인 뒤 신뢰 기기 쿠키가 없습니다. ${BOOTSTRAP_HINT}`);
        }
        writeAuthFile(key, JSON.stringify(state));
        saved = true;
    } finally {
        // 로그인 도중 실패해도 BE는 이미 신뢰 기기 토큰을 회전시켰을 수 있다. 옛 쿠키는 못 쓰므로 새 쿠키만이라도 저장한다.
        if (!saved && !isAdmin) {
            try {
                const rotated = (await context.storageState()).cookies.find((c) => c.name === 'trustedDevice');
                if (rotated) writeAuthFile(key, JSON.stringify({ cookies: [rotated], origins: [] }));
            } catch {
                // 원래 오류를 덮지 않는다
            }
        }
        await page.close().catch(() => {});
    }
}

async function submitAdminOtp(page: Page) {
    const secret = process.env.E2E_ADMIN_OTP_SECRET?.trim();
    if (!secret) throw new Error('admin: E2E_ADMIN_OTP_SECRET이 없습니다. 사람이 OTP를 등록하고 비밀키를 .env.e2e에 적으세요.');
    if (await page.getByText('이메일 인증', { exact: true }).isVisible()) {
        throw new Error('admin: OTP가 아직 등록되지 않아 메일 인증을 요구합니다. 사람이 OTP를 등록하세요.');
    }
    // 같은 30초 구간의 코드는 두 번 쓸 수 없다(BE last_used_step). 직전에 쓴 구간이면 다음 구간까지 기다린다.
    const last = existsSync(ADMIN_STEP_FILE) ? Number(readFileSync(ADMIN_STEP_FILE, 'utf8')) : 0;
    if (totpStep() <= last) await page.waitForTimeout(totpMillisToNextStep() + 1_000);
    const step = totpStep();
    await page.locator('#mfa-code').fill(totpCode(secret, step));
    writeFileSync(ADMIN_STEP_FILE, String(step), { mode: 0o600 });
    await page.getByRole('button', { name: '인증하고 로그인' }).click();

    const outcome = await Promise.race([
        page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }).then(() => 'done' as const),
        page.locator('form [role="alert"]').first().waitFor({ timeout: 30_000 }).then(async () => (await page.locator('form [role="alert"]').first().innerText()).trim()),
    ]);
    if (outcome !== 'done') throw new Error(`admin: OTP 인증 실패 — ${outcome}`);
}
