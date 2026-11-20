import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import type { BrowserContext, Page } from '@playwright/test';
import { resolveBaseUrl, resolveDb, resolvePassword } from './config.mjs';
import { runId } from './run';

// 관리자 흐름(E17 · E24 · E26)이 실행마다 새로 만드는 일반 회원. 고정 구매자(e2e-buyer1 · e2e-buyer2)를 건드리지 않으려고 따로 둔다.
// 로컬 도커 DB에만 쓴다(config가 로컬이 아니면 거절). 만든 회원은 지우지 않는다(이름에 runId가 있어 구분되고, 환경을 초기화하면 사라진다).

const DEVICE_NAME = 'e2e-qa4';
const DEVICE_TTL_DAYS = 29;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export type FreshMember = { id: number; email: string; nickname: string; trustedToken: string };

/** 일반 회원(ACTIVE) + 예치금 지갑(잔액 0) + 신뢰 기기 하나. 로그인은 loginFreshMember로 한다. */
export async function createFreshMember(label: string): Promise<FreshMember> {
    resolveBaseUrl(); // 로컬이 아니면 멈춘다
    const suffix = randomBytes(4).toString('hex');
    const email = `e2e-qa4-${label}-${runId()}-${suffix}@example.test`;
    const nickname = `q4${label}${suffix}`;
    const phone = `010-8${String(Math.floor(Math.random() * 1e7)).padStart(7, '0').replace(/(\d{3})(\d{4})/, '$1-$2')}`;
    const passwordHash = await bcrypt.hash(resolvePassword(), 10);
    const token = randomBytes(32).toString('base64url');

    const memberDb = resolveDb('MEMBER');
    const paymentDb = resolveDb('PAYMENT');
    let member: mysql.Connection | undefined;
    let payment: mysql.Connection | undefined;
    try {
        member = await mysql.createConnection(memberDb);
        payment = await mysql.createConnection(paymentDb);
        await member.beginTransaction();
        let memberId: number;
        try {
            const [res] = await member.query(
                `INSERT INTO member (created_at, updated_at, birth_date, email, nickname, password, phone, role, status, email_verified_at)
                 VALUES (NOW(6), NOW(6), '1990-01-01', ?, ?, ?, ?, 'BUYER', 'ACTIVE', NOW(6))`,
                [email, nickname, passwordHash, phone],
            );
            memberId = (res as mysql.ResultSetHeader).insertId;
            await member.query(
                `INSERT INTO trusted_device (created_at, updated_at, device_name, expires_at, last_used_at, member_id, token_hash)
                 VALUES (NOW(6), NOW(6), ?, NOW(6) + INTERVAL ? DAY, NOW(6), ?, ?)`,
                [DEVICE_NAME, DEVICE_TTL_DAYS, memberId, sha256(token)],
            );
            await member.commit();
        } catch (e) {
            await member.rollback().catch(() => {});
            throw e;
        }
        try {
            await payment.query(
                'INSERT INTO wallet (balance, created_at, member_id, updated_at, version) VALUES (0, NOW(6), ?, NOW(6), 0)',
                [memberId],
            );
        } catch (e) {
            // 두 DB에 걸친 쓰기라 한 번에 롤백할 수 없다. 지갑 없는 회원이 남지 않게 방금 만든 행을 지운다.
            await member.query('DELETE FROM trusted_device WHERE member_id = ?', [memberId]).catch(() => {});
            await member.query('DELETE FROM member WHERE id = ?', [memberId]).catch(() => {});
            throw e;
        }
        return { id: memberId, email, nickname, trustedToken: token };
    } finally {
        await member?.end().catch(() => {});
        await payment?.end().catch(() => {});
    }
}

/** 새 회원으로 UI 로그인한다(신뢰 기기 쿠키로 메일 2차 인증 건너뜀). 정지된 회원은 로그인 화면에 머문다. */
export async function submitFreshMemberLogin(context: BrowserContext, member: FreshMember): Promise<Page> {
    const base = resolveBaseUrl();
    await context.addCookies([
        {
            name: 'trustedDevice',
            value: member.trustedToken,
            domain: base.hostname,
            path: '/api/auth',
            expires: Math.floor(Date.now() / 1000) + DEVICE_TTL_DAYS * 86_400,
            httpOnly: true,
            secure: base.isHttps,
            sameSite: 'Lax',
        },
    ]);
    const page = await context.newPage();
    await page.goto('/login');
    await page.locator('#user-email').fill(member.email);
    await page.locator('#user-password').fill(resolvePassword());
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    return page;
}

/** BE는 로그인 때마다 신뢰 기기 토큰을 회전시킨다. 같은 회원으로 다시 로그인하려면 회전된 값을 받아 둔다. */
export async function rememberTrustedDevice(context: BrowserContext, member: FreshMember): Promise<void> {
    const rotated = (await context.cookies()).find((c) => c.name === 'trustedDevice');
    if (rotated) member.trustedToken = rotated.value;
}
