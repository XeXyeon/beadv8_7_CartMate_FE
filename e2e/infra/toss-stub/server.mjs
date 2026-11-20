// 토스페이먼츠 가짜 서버(E2E 전용). 카드사 본인인증 화면은 자동화할 수 없어, BE가 부르는 토스 API 두 개만 흉내 낸다.
//   POST /v1/payments/confirm   결제 승인   요청 { paymentKey, orderId, amount }
//   GET  /v1/payments/{paymentKey} 결제 조회
// 응답은 BE TossPaymentsClient가 읽는 필드(paymentKey, orderId, status, totalAmount)만 담는다.
// 승인한 결제는 메모리에 기억해 같은 paymentKey로 다시 승인하면 ALREADY_PROCESSED_PAYMENT(운영 토스와 같다)를 돌려준다.
// 키 인증(Authorization 헤더)은 보지 않는다 — 토스 서버와의 실제 통신 · 키 확인은 이 E2E 범위 밖이다.
import { createServer } from 'node:http';

const payments = new Map();
const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
};

createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    if (url.pathname === '/health') return json(res, 200, { ok: true });

    if (req.method === 'POST' && url.pathname === '/v1/payments/confirm') {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            let body;
            try { body = JSON.parse(raw); } catch { return json(res, 400, { code: 'INVALID_REQUEST', message: '본문이 JSON이 아닙니다.' }); }
            const { paymentKey, orderId, amount } = body ?? {};
            if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) return json(res, 400, { code: 'INVALID_REQUEST', message: '필수 값이 없습니다.' });
            if (payments.has(paymentKey)) return json(res, 400, { code: 'ALREADY_PROCESSED_PAYMENT', message: '이미 처리된 결제 입니다.' });
            const payment = { paymentKey, orderId, status: 'DONE', totalAmount: amount, method: '카드', approvedAt: new Date().toISOString() };
            payments.set(paymentKey, payment);
            json(res, 200, payment);
        });
        return;
    }

    const m = req.method === 'GET' && /^\/v1\/payments\/([^/]+)$/.exec(url.pathname);
    if (m) {
        const payment = payments.get(decodeURIComponent(m[1]));
        return payment ? json(res, 200, payment) : json(res, 404, { code: 'NOT_FOUND_PAYMENT', message: '존재하지 않는 결제 정보 입니다.' });
    }
    json(res, 404, { code: 'NOT_FOUND', message: `지원하지 않는 요청: ${req.method} ${url.pathname}` });
}).listen(8080, () => console.log('toss stub :8080'));
