import { test as setup } from '@playwright/test';
import { loginAndSaveState } from './support/auth';
import { ACCOUNTS, ACCOUNT_KEYS } from './support/config.mjs';

// 매 실행 처음에 5개 계정의 로그인 상태(e2e/.auth/<계정>.json)를 새로 만든다.
// 신뢰 기기 쿠키로 UI 로그인하고 BE가 회전시킨 쿠키를 다시 저장하므로, 두 번 연속 실행해도 로그인된다.
for (const key of ACCOUNT_KEYS) {
    setup(`로그인 상태 준비: ${ACCOUNTS[key].nickname}`, async ({ browser, baseURL }) => {
        setup.skip(key === 'admin' && !process.env.E2E_ADMIN_OTP_SECRET, 'E2E_ADMIN_OTP_SECRET이 없어 관리자 로그인을 건너뜁니다(사람이 OTP 등록 필요).');
        const context = await browser.newContext({ baseURL });
        try {
            await loginAndSaveState(context, key);
        } finally {
            await context.close();
        }
    });
}
