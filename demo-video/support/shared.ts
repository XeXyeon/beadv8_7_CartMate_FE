import type { Browser, PlaywrightWorkerArgs } from '@playwright/test';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { resolveBaseUrl, resolveDb } from '../../e2e/support/config.mjs';
import { Scene, WORK_DIR, readWork, writeWork, type Narrator } from './narrate';

// 장면 사이에 넘기는 값(work/*.json)과 공용 도우미. 장면은 번호 순서대로 한 번에 돌리는 것이 기본이다.
// 시연 판매자 = 장면 1에서 가입한 새 회원(장면 3에서 판매자가 된다). 구매자 · 관리자 · 두 번째 구매자는 고정 E2E 계정이다.

export type DemoMember = { email: string; nickname: string; phone: string; password: string };
export type DemoPostInfo = { postId: number; title: string; name: string; price: number };
export type DemoOrders = { e03?: number; e04?: number; e07?: number; e08Delivery?: number; e09Delivery?: number; e20Delivery?: number };

export const SELLER_STATE = path.join(WORK_DIR, 'seller-state.json');
export const member = () => {
    const m = readWork<DemoMember>('member.json');
    if (!m) throw new Error('work/member.json이 없습니다. 장면 1(회원가입)부터 돌리세요.');
    return m;
};
export const demoPost = () => {
    const p = readWork<DemoPostInfo>('post.json');
    if (!p) throw new Error('work/post.json이 없습니다. 장면 4(판매글 등록)부터 돌리세요.');
    return p;
};
export const sellerStateExists = () => existsSync(SELLER_STATE);

export const rand = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

export function newScene(order: number, id: string, title: string, browser: Browser, baseURL: string | undefined, suffix = '') {
    return new Scene(order, id, title, browser, baseURL!, suffix);
}

export async function sellerApi(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string | undefined) {
    return playwright.request.newContext({ baseURL, storageState: SELLER_STATE });
}

/** 제목 카드(인트로 · 마무리). 같은 출처의 가짜 주소(/__card)를 가로채 HTML을 돌려준다. */
export async function showCard(n: Narrator, heading: string, sub: string, lines: string[] = []) {
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e3a8a,#2563eb 55%,#60a5fa);color:#fff;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif">
      <div style="font-size:84px;font-weight:800;letter-spacing:-1px">${heading}</div>
      <div style="margin-top:18px;font-size:32px;opacity:.92">${sub}</div>
      <ul style="margin-top:40px;font-size:24px;line-height:1.9;list-style:none;padding:0;opacity:.95;text-align:center">${lines.map((l) => `<li>${l}</li>`).join('')}</ul></body>`;
    await n.context.route('**/__card', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await n.page.goto('/__card');
}

/**
 * 정산 지급 배치는 같은 날 한 번만 돈다(날짜가 Job 파라미터). 오늘 이미 돈 기록이 있으면 시연 정산을 지급할 수 없어, 로컬 payment DB의
 * 오늘자 payoutJob 기록만 지운다(로컬 가드 안에서만). 실행 기록이 없던 상태로 돌아갈 뿐 정산 · 지갑 데이터는 건드리지 않는다.
 */
export async function clearTodayPayoutBatchRuns(): Promise<number> {
    resolveBaseUrl();
    const { host, port, user, password, database } = resolveDb('PAYMENT');
    const conn = await mysql.createConnection({ host, port, user, password, database });
    try {
        const [rows] = await conn.query(
            "SELECT e.JOB_EXECUTION_ID AS eid, e.JOB_INSTANCE_ID AS iid FROM BATCH_JOB_EXECUTION e JOIN BATCH_JOB_INSTANCE i ON i.JOB_INSTANCE_ID = e.JOB_INSTANCE_ID WHERE i.JOB_NAME = 'payoutJob' AND DATE(e.START_TIME) = CURDATE()",
        );
        const list = rows as { eid: number; iid: number }[];
        for (const { eid, iid } of list) {
            await conn.query('DELETE FROM BATCH_STEP_EXECUTION_CONTEXT WHERE STEP_EXECUTION_ID IN (SELECT STEP_EXECUTION_ID FROM BATCH_STEP_EXECUTION WHERE JOB_EXECUTION_ID = ?)', [eid]);
            await conn.query('DELETE FROM BATCH_STEP_EXECUTION WHERE JOB_EXECUTION_ID = ?', [eid]);
            await conn.query('DELETE FROM BATCH_JOB_EXECUTION_CONTEXT WHERE JOB_EXECUTION_ID = ?', [eid]);
            await conn.query('DELETE FROM BATCH_JOB_EXECUTION_PARAMS WHERE JOB_EXECUTION_ID = ?', [eid]);
            await conn.query('DELETE FROM BATCH_JOB_EXECUTION WHERE JOB_EXECUTION_ID = ?', [eid]);
            await conn.query('DELETE FROM BATCH_JOB_INSTANCE WHERE JOB_INSTANCE_ID = ?', [iid]);
        }
        return list.length;
    } finally {
        await conn.end().catch(() => {});
    }
}

export function dockerUp() {
    execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', 'cartmate-e2e-member-service-1'], { stdio: 'pipe' });
}

export function saveOrders(patch: Partial<DemoOrders>) {
    const cur = readWork<DemoOrders>('orders.json') ?? {};
    writeWork('orders.json', { ...cur, ...patch });
}
export const orders = () => readWork<DemoOrders>('orders.json') ?? {};

/** 결제 대기 주문이 남아 있으면 새 주문이 막힌다("결제 대기 중인 주문이 이미 있습니다"). 장면을 다시 돌릴 때를 위해 먼저 취소한다. */
export async function cancelPendingOrders(request: import('@playwright/test').APIRequestContext) {
    const res = await request.get('/api/orders/me?page=0&size=20');
    const list = ((await res.json()).data ?? []) as { id: number; status: string }[];
    for (const o of list.filter((x) => x.status === 'PAYMENT_PENDING')) await request.post(`/api/orders/${o.id}/cancel`, { data: {} });
}
