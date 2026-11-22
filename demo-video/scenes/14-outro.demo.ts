import { test } from '@playwright/test';
import { newScene, showCard } from '../support/shared';

test('장면 14 마무리', async ({ browser, baseURL }) => {
    const s = newScene(14, 'OUTRO', '마무리', browser, baseURL);
    try {
        const n = await s.open();
        await showCard(n, 'CartMate', '시청해 주셔서 감사합니다', ['회원 · 예치금 · 판매자', '구매 · 쿠폰 · 공동구매', '배송 · 환불 · 교환 · 정산', '관리자 운영']);
        await n.beat('지금까지 카트메이트의 주요 기능을 살펴봤습니다. 시청해 주셔서 감사합니다.');
        await n.close();
    } finally {
        await s.save();
    }
});
