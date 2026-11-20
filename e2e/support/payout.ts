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

export type PayoutRow = { id: number; status: string; salesAmount: number; feeAmount: number; payoutAmount: number; paidAt: string | null };

/** 판매자의 정산 행(최신순). 지급 완료 · 수수료 단언에 쓴다. */
export async function listPayouts(sellerId: number): Promise<PayoutRow[]> {
    return withPaymentDb(async (conn) => {
        const [rows] = await conn.query(
            'SELECT id, status, sales_amount, fee_amount, payout_amount, paid_at FROM payout WHERE seller_id = ? ORDER BY id DESC',
            [sellerId],
        );
        return (rows as Record<string, unknown>[]).map((r) => ({
            id: Number(r.id),
            status: String(r.status),
            salesAmount: Number(r.sales_amount),
            feeAmount: Number(r.fee_amount),
            payoutAmount: Number(r.payout_amount),
            paidAt: (r.paid_at as string | null) ?? null,
        }));
    });
}
