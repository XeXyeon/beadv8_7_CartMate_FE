import { expect, type Page } from '@playwright/test';

// 배송 · 클레임 화면 동작(e2e/flows/ship/ship.spec.ts의 도우미를 시연용으로 옮김). 시연 판매자 계정은 데이터가 적어 첫 쪽에서 다 보인다.

export async function applyClaim(page: Page, orderId: number, kind: '반품' | '교환', reasonValue: 'SIMPLE_CHANGE' | 'SIZE_MISMATCH') {
    await page.goto(`/mypage/orders/${orderId}/claim`);
    const checkbox = page.locator('input[name="claim-item"]');
    await expect(checkbox).toBeEnabled();
    await checkbox.check();
    await page.getByRole('radio', { name: kind === '반품' ? /반품/ : /상품 교환/ }).check();
    await page.locator('#claim-reason').selectOption(reasonValue);
    await page.getByRole('button', { name: '요청하기' }).click();
    await expect(page).toHaveURL(/\/mypage\/claims\?created=\d+/);
    await expect(page.getByText(/이\(가\) 접수되었습니다/)).toBeVisible();
}

export async function approveFirst(sp: Page) {
    const review = sp.getByRole('button', { name: '검토하기' }).first();
    // 접수는 비동기로 판매자 목록에 나타난다
    await expect(async () => {
        await sp.goto('/seller/claims?tab=pending');
        await expect(review).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000, intervals: [2_000] });
    await review.click();
    const dialog = sp.getByRole('dialog');
    await dialog.getByRole('button', { name: '전체 승인' }).click();
    await dialog.getByRole('button', { name: '처리', exact: true }).click();
    await expect(dialog).toBeHidden();
}

export async function completeClaim(sp: Page, label: '반품 완료' | '교환 완료') {
    await sp.goto('/seller/claims?tab=progress');
    const btn = sp.getByRole('button', { name: label }).first();
    await expect(async () => {
        await sp.reload();
        await expect(btn).toBeEnabled({ timeout: 3_000 });
    }).toPass({ timeout: 120_000, intervals: [3_000] });
    await btn.click();
}
