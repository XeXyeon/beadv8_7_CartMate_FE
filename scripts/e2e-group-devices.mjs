// QA-5 전용: 이 워크트리만 쓰는 신뢰 기기(device_name = 'e2e-qa5')를 로컬 DB에 발급하고 e2e/.auth/<계정>.json에 쿠키를 저장한다.
//   node scripts/e2e-group-devices.mjs   (반드시 워크트리 루트에서 실행. 이 워크트리에서는 e2e:bootstrap 대신 이것을 다시 돌린다. 쓰다 실패하면 다시 실행하면 복구된다)
// 왜: 신뢰 기기 쿠키는 로그인할 때마다 회전해 옛 쿠키가 죽는다. 워크트리마다 쿠키 파일을 복사해 쓰면 서로 죽이므로,
//     워크트리마다 자기 이름의 기기를 따로 갖는다. e2e:bootstrap의 기기('e2e-bootstrap')는 지우지 않는다.
// 쓰는 것: member DB trusted_device(일반 계정 4개 × 1행). 이 스크립트가 만든 'e2e-qa5' 행만 지우고 다시 만든다. 로컬 가드(config.mjs) 통과 필수.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { ACCOUNTS, AUTH_DIR, authFile, loadE2eEnv, resolveBaseUrl, resolveDb } from '../e2e/support/config.mjs';

const DEVICE_NAME = 'e2e-qa5';
const TTL_DAYS = 29;
const KEYS = ['buyer1', 'buyer2', 'seller', 'target'];

loadE2eEnv();
const base = resolveBaseUrl(); // 로컬이 아니면 여기서 멈춘다
const { host, port, user, password, database } = resolveDb('MEMBER'); // 로컬 호스트 · 포트 · cartmate_* 이름이 아니면 멈춘다
const conn = await mysql.createConnection({ host, port, user, password, database, dateStrings: true, charset: 'utf8mb4' });
await conn.query("SET time_zone = '+09:00'"); // BE는 KST 벽시계 값으로 만료를 비교한다
mkdirSync(AUTH_DIR, { recursive: true });
try {
    for (const key of KEYS) {
        const [rows] = await conn.query('SELECT id FROM member WHERE email = ?', [ACCOUNTS[key].email]);
        const memberId = rows[0]?.id;
        if (!memberId) throw new Error(`${key}: member 행이 없습니다. npm run e2e:bootstrap을 먼저 실행하세요.`);
        const token = randomBytes(32).toString('base64url');
        await conn.beginTransaction();
        await conn.query('DELETE FROM trusted_device WHERE member_id = ? AND device_name = ?', [memberId, DEVICE_NAME]);
        await conn.query(
            `INSERT INTO trusted_device (created_at, updated_at, device_name, expires_at, last_used_at, member_id, token_hash)
             VALUES (NOW(6), NOW(6), ?, NOW(6) + INTERVAL ? DAY, NOW(6), ?, ?)`,
            [DEVICE_NAME, TTL_DAYS, memberId, createHash('sha256').update(token).digest('hex')],
        );
        await conn.commit();
        const expires = Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;
        const state = { cookies: [{ name: 'trustedDevice', value: token, domain: base.hostname, path: '/api/auth', expires, httpOnly: true, secure: base.isHttps, sameSite: 'Lax' }], origins: [] };
        const file = authFile(key);
        writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
        chmodSync(`${file}.tmp`, 0o600);
        renameSync(`${file}.tmp`, file);
        console.log(`${ACCOUNTS[key].email}: trusted_device(${DEVICE_NAME}) 발급 + e2e/.auth/${key}.json`);
    }
} catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
} finally {
    await conn.end().catch(() => {});
}
