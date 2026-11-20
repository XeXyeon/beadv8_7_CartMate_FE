// E2E 고정 테스트 계정 5개를 로컬 도커 DB(e2e/infra)에 넣는다. 로컬 호스트가 아니면 config가 거절한다.
//
//   npm run e2e:bootstrap              계정을 넣는다(이미 있으면 건너뜀 = 멱등)
//   npm run e2e:bootstrap -- --dry-run 읽기만 하고 무엇을 쓸지 출력한다
//
// 쓰는 행(계정 5개 한정):
//   member DB : member(5), member_address(buyer1 · buyer2), seller(e2e-seller), trusted_device(관리자 제외 4),
//               member_otp(e2e-admin, 로컬 암호화 키로 암호화한 OTP 비밀키)
//   payment DB: wallet(5, 잔액 0)
// 이 5개 이메일 밖의 행은 읽지도 쓰지도 않는다. 신뢰 기기 쿠키는 e2e/.auth/<계정>.json, 관리자 OTP 비밀키는
// 고정 로컬 값(e2e/support/config.mjs DEFAULT_ADMIN_OTP_SECRET)이라 파일로 저장하지 않는다. 비밀번호 · 쿠키 · 비밀키는 출력하지 않는다.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { ACCOUNTS, ACCOUNT_KEYS, AUTH_DIR, adminOtpSecret, authFile, loadE2eEnv, resolveBaseUrl, resolveDb, resolveOtpKey, resolvePassword } from '../e2e/support/config.mjs';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dryRun = process.argv.includes('--dry-run');
const DEVICE_NAME = 'e2e-bootstrap';
const DEVICE_TTL_DAYS = 29; // BE 신뢰 기기 기본 30일보다 짧게. BE는 로그인 때 토큰만 회전시키고 만료는 늘리지 않는다.
const DEVICE_RENEW_BEFORE_DAYS = 7; // 만료까지 이보다 적게 남았으면 다시 발급한다.
const SELLER_BANK = 'KB';
const SELLER_ACCOUNT_NUMBER = '9990000000001'; // 가짜 계좌. (bank_name, account_number)가 유니크라 고정값을 쓴다.

// 필요한 테이블 · 컬럼이 있는지 먼저 확인한다(스키마가 예상과 다르면 아무것도 쓰지 않고 멈춘다).
const REQUIRED_COLUMNS = {
    member: ['email', 'password', 'nickname', 'phone', 'birth_date', 'role', 'status', 'email_verified_at', 'created_at', 'updated_at'],
    member_address: ['member_id', 'receiver_name', 'receiver_phone', 'zip_code', 'basic_address', 'detail_address', 'is_default', 'created_at', 'updated_at'],
    seller: ['member_id', 'seller_type', 'phone_number', 'bank_name', 'account_holder', 'account_number', 'status', 'created_at', 'updated_at'],
    trusted_device: ['member_id', 'token_hash', 'device_name', 'last_used_at', 'expires_at', 'created_at', 'updated_at'],
    wallet: ['member_id', 'balance', 'version', 'created_at', 'updated_at'],
    payout_seller: ['seller_id', 'member_id'],
    member_otp: ['member_id', 'secret_encrypted', 'enabled_at', 'last_used_step', 'created_at', 'updated_at'],
};

function fail(message) {
    console.error(`중단: ${message}`);
    process.exit(1);
}

async function connect(config) {
    const { host, port, user, password, database, ssl } = config;
    const conn = await mysql.createConnection({ host, port, user, password, database, ssl, dateStrings: true, charset: 'utf8mb4' });
    // BE는 KST 벽시계 값으로 만료를 비교한다. 이 연결의 NOW()를 KST로 맞춘다.
    await conn.query("SET time_zone = '+09:00'");
    return conn;
}

async function assertColumns(conn, database, tables) {
    for (const table of tables) {
        const [rows] = await conn.query(
            'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
            [database, table],
        );
        const have = new Set(rows.map((r) => r.name));
        if (have.size === 0) fail(`${database}.${table} 테이블이 없습니다(DB 이름이나 서비스 구성을 확인하세요).`);
        const missing = REQUIRED_COLUMNS[table].filter((c) => !have.has(c));
        if (missing.length) fail(`${database}.${table}에 예상한 컬럼이 없습니다: ${missing.join(', ')}`);
    }
}

function readTrustedDeviceToken(key) {
    const file = authFile(key);
    if (!existsSync(file)) return null;
    try {
        const state = JSON.parse(readFileSync(file, 'utf8'));
        return state.cookies?.find((c) => c.name === 'trustedDevice')?.value ?? null;
    } catch {
        return null;
    }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

loadE2eEnv();
const base = (() => {
    try {
        return resolveBaseUrl();
    } catch (e) {
        return fail(e.message);
    }
})();
let password;
let memberDb;
let paymentDb;
try {
    password = resolvePassword();
    memberDb = resolveDb('MEMBER');
    paymentDb = resolveDb('PAYMENT');
} catch (e) {
    fail(e.message);
}

const member = await connect(memberDb);
const payment = await connect(paymentDb);
try {
    await assertColumns(member, memberDb.database, ['member', 'member_address', 'seller', 'trusted_device', 'member_otp']);
    await assertColumns(payment, paymentDb.database, ['wallet', 'payout_seller']);

    // ── 현재 상태를 읽어 할 일을 정한다(읽기만) ───────────────────────────────
    const plan = [];
    for (const key of ACCOUNT_KEYS) {
        const a = ACCOUNTS[key];
        const [[row]] = await member.query('SELECT id, role, status, nickname FROM member WHERE email = ?', [a.email]);
        // 닉네임이 다른 회원에게 쓰이는지만 본다(그 회원의 정보는 읽지 않는다).
        const [[nickTaken]] = await member.query('SELECT 1 AS taken FROM member WHERE nickname = ? AND email <> ?', [a.nickname, a.email]);
        if (nickTaken) fail(`닉네임 ${a.nickname}을 다른 회원이 쓰고 있습니다.`);
        if (row && row.role !== a.role) fail(`${a.email}이 이미 있지만 역할이 ${row.role}입니다(기대 ${a.role}). 직접 확인하세요.`);

        const item = { key, memberId: row?.id ?? null, status: row?.status ?? null, actions: [] };
        if (!row) item.actions.push('member');

        const [[wallet]] = row ? await payment.query('SELECT id FROM wallet WHERE member_id = ?', [row.id]) : [[null]];
        if (!wallet) item.actions.push('wallet');

        if (a.address) {
            const [[addr]] = row
                ? await member.query('SELECT id FROM member_address WHERE member_id = ? AND is_default = b\'1\'', [row.id])
                : [[null]];
            if (!addr) item.actions.push('address');
        }
        if (a.seller) {
            const [[seller]] = row ? await member.query('SELECT id FROM seller WHERE member_id = ?', [row.id]) : [[null]];
            if (!seller) item.actions.push('seller');
            // 정산(payment)은 판매자 등록 이벤트로 판매자를 복제한다. seller 행을 직접 넣었으니 같은 복제본을 payout_seller에도 넣어야 정산 조회 · 지급이 된다.
            const [[replica]] = seller ? await payment.query('SELECT seller_id FROM payout_seller WHERE seller_id = ?', [seller.id]) : [[null]];
            if (seller && !replica) item.actions.push('payout_seller');
        }
        if (a.role === 'ADMIN') {
            const [[otp]] = row ? await member.query('SELECT enabled_at, secret_encrypted FROM member_otp WHERE member_id = ?', [row.id]) : [[null]];
            // 고정 비밀키(config.adminOtpSecret)와 DB에 심긴 값이 같으면 건드리지 않는다(멱등). 다르거나 없으면 이 계정의 OTP 행만 같은 값으로 다시 심는다.
            if (!otp?.enabled_at || !sameOtpSecret(otp.secret_encrypted)) item.actions.push('otp');
        }
        if (a.trusted) {
            const token = readTrustedDeviceToken(key);
            let valid = false;
            if (row && token) {
                const [[dev]] = await member.query(
                    'SELECT id FROM trusted_device WHERE member_id = ? AND token_hash = ? AND expires_at > NOW(6) + INTERVAL ? DAY',
                    [row.id, sha256(token), DEVICE_RENEW_BEFORE_DAYS],
                );
                valid = Boolean(dev);
            }
            if (!valid) item.actions.push('trusted_device');
        }
        plan.push(item);
    }

    console.log('\n대상');
    console.log(`  FE        ${base.origin}`);
    console.log(`  member DB ${memberDb.host}:${memberDb.port}/${memberDb.database}`);
    console.log(`  payment DB ${paymentDb.host}:${paymentDb.port}/${paymentDb.database}`);
    console.log('\n계정별 상태 · 쓸 행(아무것도 없으면 건너뜀)');
    for (const p of plan) {
        const a = ACCOUNTS[p.key];
        if (p.status && p.status !== 'ACTIVE') console.log(`  경고: ${a.email}의 상태가 ${p.status}입니다(이전 테스트가 원상 복구하지 못했을 수 있음).`);
        console.log(`  ${a.email.padEnd(28)} ${a.role.padEnd(7)} ${p.memberId ? `member#${p.memberId}(${p.status})` : '없음'.padEnd(10)} → ${p.actions.length ? p.actions.join(', ') : '건너뜀'}`);
    }

    if (plan.every((p) => p.actions.length === 0)) {
        console.log('\n쓸 것이 없습니다.');
        process.exit(0);
    }
    if (dryRun) {
        console.log('\n--dry-run이라 아무것도 쓰지 않았습니다.');
        process.exit(0);
    }

    // ── 쓰기 ───────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 10);
    mkdirSync(AUTH_DIR, { recursive: true });
    const written = [];
    process.on('exit', (code) => {
        if (code !== 0 && written.length) console.error(`\n실패 전까지 쓴 행:\n  ${written.join('\n  ')}\n(다시 실행하면 빠진 행만 채웁니다)`);
    });

    for (const p of plan) {
        const a = ACCOUNTS[p.key];
        let memberId = p.memberId;

        await member.beginTransaction();
        try {
            if (p.actions.includes('member')) {
                const [res] = await member.query(
                    `INSERT INTO member (created_at, updated_at, birth_date, email, nickname, password, phone, role, status, email_verified_at)
                     VALUES (NOW(6), NOW(6), '1990-01-01', ?, ?, ?, ?, ?, 'ACTIVE', NOW(6))`,
                    [a.email, a.nickname, passwordHash, a.phone, a.role],
                );
                memberId = res.insertId;
                written.push(`${a.email}: member#${memberId}`);
            }
            if (p.actions.includes('address')) {
                await member.query(
                    `INSERT INTO member_address (created_at, updated_at, basic_address, is_default, detail_address, receiver_name, receiver_phone, zip_code, member_id)
                     VALUES (NOW(6), NOW(6), '서울특별시 강남구 테헤란로 123', b'1', '4층 402호', ?, ?, '06234', ?)`,
                    [a.nickname, a.phone, memberId],
                );
                written.push(`${a.email}: member_address`);
            }
            if (p.actions.includes('seller')) {
                // id는 BE와 같이 자동 증가에 맡긴다(seller.id는 회원 id와 다른 값이며 토큰의 sellerId로 쓰인다).
                const [res] = await member.query(
                    `INSERT INTO seller (created_at, updated_at, account_holder, account_number, bank_name, phone_number, seller_type, status, member_id)
                     VALUES (NOW(6), NOW(6), 'E2E 판매자', ?, ?, '010-9000-0003', 'INDIVIDUAL', 'ACTIVE', ?)`,
                    [SELLER_ACCOUNT_NUMBER, SELLER_BANK, memberId],
                );
                written.push(`${a.email}: seller#${res.insertId}`);
            }
            if (p.actions.includes('otp')) {
                // 이 계정의 OTP 행만 지우고 새로 심는다. 이미 쓰인 구간(last_used_step)은 0으로 시작한다.
                const secret = base32Decode(adminOtpSecret());
                await member.query('DELETE FROM member_otp WHERE member_id = ?', [memberId]);
                await member.query(
                    `INSERT INTO member_otp (created_at, updated_at, member_id, secret_encrypted, enabled_at, last_used_step)
                     VALUES (NOW(6), NOW(6), ?, ?, NOW(6), 0)`,
                    [memberId, sealOtpSecret(secret, resolveOtpKey())],
                );
                written.push(`${a.email}: member_otp`);
            }
            if (p.actions.includes('trusted_device')) {
                // 이 스크립트가 만든 이 계정의 이전 신뢰 기기만 지우고 새로 발급한다.
                await member.query('DELETE FROM trusted_device WHERE member_id = ? AND device_name = ?', [memberId, DEVICE_NAME]);
                const token = randomBytes(32).toString('base64url');
                await member.query(
                    `INSERT INTO trusted_device (created_at, updated_at, device_name, expires_at, last_used_at, member_id, token_hash)
                     VALUES (NOW(6), NOW(6), ?, NOW(6) + INTERVAL ? DAY, NOW(6), ?, ?)`,
                    [DEVICE_NAME, DEVICE_TTL_DAYS, memberId, sha256(token)],
                );
                await member.commit();
                saveTrustedDeviceCookie(p.key, token, base);
                written.push(`${a.email}: trusted_device + e2e/.auth/${p.key}.json`);
            } else {
                await member.commit();
            }
        } catch (e) {
            await member.rollback().catch(() => {});
            throw e;
        }

        if (p.actions.includes('wallet')) {
            await payment.query(
                'INSERT INTO wallet (balance, created_at, member_id, updated_at, version) VALUES (0, NOW(6), ?, NOW(6), 0)',
                [memberId],
            );
            written.push(`${a.email}: wallet`);
        }

        if (p.actions.includes('payout_seller')) {
            const [[sellerRow]] = await member.query('SELECT id FROM seller WHERE member_id = ?', [memberId]);
            await payment.query('INSERT INTO payout_seller (seller_id, member_id) VALUES (?, ?)', [sellerRow.id, memberId]);
            written.push(`${a.email}: payout_seller#${sellerRow.id}`);
        }
    }

    console.log('\n쓴 행');
    for (const line of written) console.log(`  ${line}`);
} finally {
    await member.end().catch(() => {});
    await payment.end().catch(() => {});
}

/** 신뢰 기기 쿠키만 담은 storageState를 저장한다. 로그인 setup이 이 쿠키로 로그인하고 회전된 쿠키를 다시 저장한다. */
function saveTrustedDeviceCookie(key, token, baseUrl) {
    const expires = Math.floor(Date.now() / 1000) + DEVICE_TTL_DAYS * 24 * 60 * 60;
    const state = {
        cookies: [
            // BE TrustedDeviceCookie: HttpOnly · SameSite=Lax · path=/api/auth · Secure(운영)
            { name: 'trustedDevice', value: token, domain: baseUrl.hostname, path: '/api/auth', expires, httpOnly: true, secure: baseUrl.isHttps, sameSite: 'Lax' },
        ],
        origins: [],
    };
    const file = authFile(key);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
}

/** BE OtpSecretCipher와 같은 형식: "v1:" + Base64(IV 12바이트 + AES-256-GCM 암호문 + 태그 16바이트). */
function sealOtpSecret(secret, base64Key) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) throw new Error('E2E_OTP_ENCRYPTION_KEY는 Base64 32바이트여야 합니다.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const sealed = Buffer.concat([cipher.update(secret), cipher.final(), cipher.getAuthTag()]);
    return `v1:${Buffer.concat([iv, sealed]).toString('base64')}`;
}

function base32Decode(text) {
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of text) {
        value = (value << 5) | BASE32.indexOf(ch);
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

/** sealOtpSecret의 반대: DB에 심긴 값이 고정 비밀키와 같은지. 복호화가 안 되면(다른 암호화 키 등) 다르다고 본다. */
function sameOtpSecret(sealed) {
    try {
        const raw = Buffer.from(String(sealed).replace(/^v1:/, ''), 'base64');
        const key = Buffer.from(resolveOtpKey(), 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(raw.length - 16));
        const plain = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]);
        return plain.equals(base32Decode(adminOtpSecret()));
    } catch {
        return false;
    }
}
