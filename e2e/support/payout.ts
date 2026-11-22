import { execFileSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { resolveBaseUrl, resolveDb } from './config.mjs';

// 정산(payout) 지급 예정 시각은 구매 확정한 달의 다음 달 15일이라 E2E에서 기다릴 수 없다.
// 해당 판매자의 PENDING 정산만 지급 예정 시각을 과거로 당겨, 지급 배치(payment의 CUSTOM_PAYOUT_CRON)가 집게 한다.
// 로컬 DB에만 쓴다(config가 로컬이 아니면 거절). 대상은 판매자 id 하나로 좁힌다.

async function withPaymentDb<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
    resolveBaseUrl();
    const { host, port, user, password, database } = resolveDb('PAYMENT');
    const conn = await mysql.createConnection({ host, port, user, password, database, dateStrings: true });
    try {
        await conn.query("SET time_zone = '+09:00'"); // BE는 KST 벽시계 값으로 비교한다
        return await fn(conn);
    } finally {
        await conn.end();
    }
}

/** 판매자(seller.id)의 PENDING 정산을 지금 지급 대상으로 당긴다. 바꾼 행 수를 돌려준다. */
export async function makePayoutsDue(sellerId: number): Promise<number> {
    return withPaymentDb(async (conn) => {
        const [res] = await conn.query(
            "UPDATE payout SET scheduled_at = NOW(6) - INTERVAL 1 DAY WHERE seller_id = ? AND status = 'PENDING'",
            [sellerId],
        );
        return (res as mysql.ResultSetHeader).affectedRows;
    });
}

export type PayoutRow = { id: number; orderId: number; status: string; salesAmount: number; feeAmount: number; payoutAmount: number; paidAt: string | null };

/** 판매자의 정산 행(최신순). 지급 완료 · 수수료 단언에 쓴다. */
export async function listPayouts(sellerId: number): Promise<PayoutRow[]> {
    return withPaymentDb(async (conn) => {
        const [rows] = await conn.query(
            'SELECT id, order_id, status, sales_amount, fee_amount, payout_amount, paid_at FROM payout WHERE seller_id = ? ORDER BY id DESC',
            [sellerId],
        );
        return (rows as Record<string, unknown>[]).map((r) => ({
            id: Number(r.id),
            orderId: Number(r.order_id),
            status: String(r.status),
            salesAmount: Number(r.sales_amount),
            feeAmount: Number(r.fee_amount),
            payoutAmount: Number(r.payout_amount),
            paidAt: (r.paid_at as string | null) ?? null,
        }));
    });
}

/** 오늘(KST) 지급 배치가 이미 한 번이라도 돌았는지. 배치는 날짜를 Job 파라미터로 써서 같은 날 두 번째 실행은 막힌다(비어 있어도 하루치를 쓴다). */
export async function payoutBatchRanToday(): Promise<boolean> {
    return withPaymentDb(async (conn) => {
        const [rows] = await conn.query('SELECT COUNT(*) AS c FROM BATCH_JOB_EXECUTION e JOIN BATCH_JOB_INSTANCE i ON i.JOB_INSTANCE_ID = e.JOB_INSTANCE_ID WHERE i.JOB_NAME = ? AND DATE(e.START_TIME) = CURDATE()', ['payoutJob']);
        return Number((rows as { c: number }[])[0]?.c) > 0;
    });
}

export const DEFAULT_PAYOUT_CRON = '0 10 0 * * *';
export const EVERY_MINUTE_PAYOUT_CRON = '0 * * * * *';

/** 지금 payment 서비스에 걸린 지급 cron(컨테이너 환경 변수). */
export function currentPayoutCron(): string {
    resolveBaseUrl();
    return execFileSync('docker', ['compose', '-p', 'cartmate-e2e', '-f', 'e2e/infra/compose.yaml', 'exec', '-T', 'payment-service', 'printenv', 'CUSTOM_PAYOUT_CRON'], { encoding: 'utf8', cwd: process.cwd() }).trim();
}

/**
 * payment 서비스만 새 cron으로 다시 띄운다(다른 서비스 · 이미지 빌드는 건드리지 않는다). 로컬 가드 안에서만.
 * 매분 cron을 걸면 다시 뜬 뒤 첫 분에 그날 배치가 돈다 → 지급 대상을 먼저 만들어 둔 다음 부를 것. 설정 파일(.env.e2e)은 env.sh와 같이 읽되, 넘긴 cron이 파일 값보다 우선한다.
 */
export function restartPaymentWithPayoutCron(cron: string): void {
    resolveBaseUrl();
    if (!/^[0-9*/,\- ]+$/.test(cron) || cron.trim().split(/\s+/).length !== 6) throw new Error(`cron 값이 올바르지 않습니다(6필드): ${cron}`);
    const env: NodeJS.ProcessEnv = { ...process.env, PAYOUT_CRON_OVERRIDE: cron };
    delete env.DOCKER_HOST; // 로컬 데몬만 쓴다
    try {
        execFileSync(
            'bash',
            ['-c', 'set -a; [ -f .env.e2e ] && . ./.env.e2e; set +a; E2E_PAYOUT_CRON="$PAYOUT_CRON_OVERRIDE" docker compose -p cartmate-e2e -f e2e/infra/compose.yaml up -d --no-deps --wait --wait-timeout 200 payment-service'],
            { env, stdio: 'pipe', timeout: 240_000, encoding: 'utf8' },
        );
    } catch (e) {
        const err = e as { stderr?: string };
        throw new Error(`payment 서비스를 다시 띄우지 못했습니다: ${String(err.stderr ?? '').split('\n').slice(-5).join(' | ')}`);
    }
}
