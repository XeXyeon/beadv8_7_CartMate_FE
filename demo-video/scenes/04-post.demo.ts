import { expect, test } from '@playwright/test';
import { won } from '../../e2e/support/shop';
import { productImage } from '../support/data';
import { writeWork } from '../support/narrate';
import { SELLER_STATE, newScene } from '../support/shared';

// E05 판매글 등록 → 내 목록 · 상세 · 검색 노출. 등록한 판매글은 이후 구매 장면에서 쓴다.
test('장면 04 판매글 등록 (E05)', async ({ browser, baseURL }) => {
    const title = '러닝 쿨링 양말 3종 세트';
    const price = 23_000;
    const image = await productImage(browser, '🧦', '러닝 쿨링 양말', '#bfdbfe');
    const s = newScene(4, 'E05', '판매글 등록', browser, baseURL);
    try {
        const n = await s.open({ storageState: SELLER_STATE });
        const page = n.page;
        await n.beat('판매자 센터에서 새 판매글을 등록합니다. 제목과 카테고리, 상품 이름과 가격을 입력합니다.', async () => {
            await page.goto('/seller/products/new');
            await page.locator('#sales-title').pressSequentially(title, { delay: 25 });
            await page.locator('#sales-category').selectOption({ index: 1 });
            await page.locator('#sales-product-name').fill(title);
            await page.locator('#sales-price').fill(String(price));
        });
        await n.beat('상세 설명과 재고 수량을 적고, 상품 사진을 올린 뒤 저장합니다.', async () => {
            await page.getByLabel('상세 설명').fill('통기성이 좋은 러닝 전용 쿨링 양말 세트입니다.');
            await page.getByLabel('재고 수량').first().fill('40');
            await page.locator('#sales-images').setInputFiles({ name: 'socks.png', mimeType: 'image/png', buffer: image });
            await page.getByRole('button', { name: '저장 및 등록 완료' }).click();
            await expect(page).toHaveURL(/\/seller\/products$/);
        });
        let postId = 0;
        await n.beat('등록이 끝나면 내 판매글 목록에 나타나고, 보기를 누르면 구매자가 보는 상세 화면이 열립니다.', async () => {
            const row = page.getByRole('row').filter({ hasText: title });
            await expect(row).toBeVisible();
            await row.getByRole('link', { name: '보기' }).click();
            await expect(page).toHaveURL(/\/products\/\d+/);
            postId = Number(new URL(page.url()).pathname.split('/').pop());
            await expect(page.getByText(won(price)).first()).toBeVisible();
        });
        await n.beat('검색에서도 바로 찾을 수 있도록 색인됩니다.', async () => {
            await expect(async () => {
                await page.goto(`/search?q=${encodeURIComponent(title)}`);
                await expect(page.getByText(title).first()).toBeVisible({ timeout: 3_000 });
            }).toPass({ timeout: 60_000, intervals: [2_000] });
        });
        writeWork('post.json', { postId, title, name: title, price });
        await n.close();
    } finally {
        await s.save();
    }
});
