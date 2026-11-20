import { expect, test } from '@playwright/test';
import { authFile } from '../support/auth';
import { adminOtpSecret } from '../support/config.mjs';

// 역할별 smoke: 로그인 상태 준비(setup)가 만든 storageState로 접근 제어가 역할대로 동작하는지 본다. (QA-3의 E01이 더 자세히 다룬다)

test.describe('비로그인', () => {
    test('보호된 화면은 로그인 화면으로 보낸다 @smoke', async ({ page }) => {
        await page.goto('/cart');
        await expect(page).toHaveURL(/\/login\?next=%2Fcart/);
    });
});

test.describe('구매자', () => {
    test.use({ storageState: authFile('buyer1') });

    test('마이페이지는 열리고 관리자 · 판매자 화면은 막힌다 @smoke', async ({ page }) => {
        await page.goto('/mypage');
        await expect(page).toHaveURL(/\/mypage$/);
        await page.goto('/admin');
        await expect(page).toHaveURL(/\/$/);
        await page.goto('/seller');
        await expect(page).toHaveURL(/\/mypage\/seller-apply/);
    });
});

test.describe('판매자', () => {
    test.use({ storageState: authFile('seller') });

    test('판매자 화면이 열린다 @smoke', async ({ page }) => {
        await page.goto('/seller');
        await expect(page).toHaveURL(/\/seller$/);
    });
});

test.describe('관리자', () => {
    // 로그인 상태 파일이 없으면 storageState 읽기에서 실패하므로, 시작 전에 describe 단위로 건너뛴다.
    test.skip(!adminOtpSecret(), '관리자 OTP 비밀키가 없어 건너뜁니다(npm run e2e:bootstrap).');
    test.use({ storageState: authFile('admin') });

    test('관리자 화면이 열린다 @smoke', async ({ page }) => {
        await page.goto('/admin');
        await expect(page).toHaveURL(/\/admin/);
    });
});
