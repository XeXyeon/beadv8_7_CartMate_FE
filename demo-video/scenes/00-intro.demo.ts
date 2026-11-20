import { test } from '@playwright/test';
import { newScene, showCard } from '../support/shared';

test('장면 00 인트로', async ({ browser, baseURL }) => {
    const s = newScene(0, 'INTRO', '소개', browser, baseURL);
    try {
        const n = await s.open();
        await showCard(n, 'TEAMBUY', '함께 모아 사고, 안전하게 거래하는 공동구매 장터 · CartMate 프로젝트', ['회원가입 · 충전 · 판매자 등록', '구매 · 쿠폰 · 공동구매(N빵 · 개인물품 공구)', '배송 · 환불 · 교환 · 정산', '관리자 운영']);
        await n.beat('안녕하세요. 팀바이 시연 영상입니다. 팀바이는 여러 사람이 함께 모아 사는 공동구매와, 판매자와 구매자가 안전하게 거래하는 일반 구매를 모두 지원하는 장터입니다.');
        await n.beat('회원가입과 충전, 판매자 등록부터 구매, 쿠폰, 공동구매, 배송, 환불, 정산, 관리자 운영까지 주요 기능을 차례로 보여 드리겠습니다.');
        await n.close();
    } finally {
        await s.save();
    }
});
