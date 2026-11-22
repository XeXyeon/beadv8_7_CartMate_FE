import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test as setup } from '@playwright/test';
import { loginAndSaveState } from './support/auth';
import { ACCOUNTS, ACCOUNT_KEYS } from './support/config.mjs';

const run = promisify(execFile);

// 고정 계정은 여러 워크트리 · 세션이 함께 쓰고 BE는 로그인할 때마다 신뢰 기기 토큰을 바꾼다. 그래서 쿠키가 무효가 돼 있을 수 있다.
// 매 실행 맨 처음에 bootstrap을 돌려 무효하거나 만료가 가까운 신뢰 기기 쿠키만 다시 발급한다(멱등 · 로컬 가드는 bootstrap이 건다).
setup('고정 계정 준비(bootstrap)', async () => {
    setup.setTimeout(120_000);
    try {
        await run(process.execPath, ['scripts/e2e-bootstrap.mjs'], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 });
    } catch (e) {
        const err = e as { stdout?: string; stderr?: string; message: string };
        throw new Error(`bootstrap 실패: ${(err.stderr || err.stdout || err.message).slice(-800)}`);
    }
});

// 그다음 5개 계정의 로그인 상태(e2e/.auth/<계정>.json)를 새로 만든다.
// 신뢰 기기 쿠키로 UI 로그인하고 BE가 회전시킨 쿠키를 다시 저장하므로, 두 번 연속 실행해도 로그인된다.
for (const key of ACCOUNT_KEYS) {
    setup(`로그인 상태 준비: ${ACCOUNTS[key].nickname}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL });
        try {
            await loginAndSaveState(context, key);
        } finally {
            await context.close();
        }
    });
}
