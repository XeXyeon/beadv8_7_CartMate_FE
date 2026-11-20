// E2E 공용 설정: .env.e2e 읽기, 대상 주소 가드, 고정 테스트 계정표, DB 접속 정보.
// bootstrap(.mjs)과 Playwright(.ts)가 함께 쓰므로 JS로 둔다.
import { existsSync } from 'node:fs';
import path from 'node:path';

// npm 스크립트는 저장소 루트에서 실행된다. (Playwright가 이 파일을 CJS로 바꿔 읽으므로 import.meta를 쓰지 않는다)
export const ROOT = process.cwd();
export const AUTH_DIR = path.join(ROOT, 'e2e/.auth');
export const ENV_FILE = path.join(ROOT, '.env.e2e');

/** `.env.e2e`가 있으면 환경 변수로 읽는다(이미 정해진 값은 덮어쓰지 않는다). */
export function loadE2eEnv() {
    if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

/**
 * 고정 테스트 계정. 운영 DB에 bootstrap으로 한 번 넣는다. 이 5개 말고는 건드리지 않는다.
 * trusted: 일반 계정은 신뢰 기기 쿠키로 메일 2차 인증을 건너뛴다. 관리자는 신뢰 기기를 보지 않는다(OTP 앱 코드).
 */
export const ACCOUNTS = {
    buyer1: { email: 'e2e-buyer1@example.test', nickname: 'e2e-buyer1', phone: '010-9000-0001', role: 'BUYER', address: true, trusted: true },
    buyer2: { email: 'e2e-buyer2@example.test', nickname: 'e2e-buyer2', phone: '010-9000-0002', role: 'BUYER', address: true, trusted: true },
    seller: { email: 'e2e-seller@example.test', nickname: 'e2e-seller', phone: '010-9000-0003', role: 'SELLER', seller: true, trusted: true },
    admin: { email: 'e2e-admin@example.test', nickname: 'e2e-admin', phone: '010-9000-0004', role: 'ADMIN', trusted: false },
    // 회원 정지 · 탈퇴 신청/취소 대상. 테스트가 항상 원상 복구한다.
    target: { email: 'e2e-target@example.test', nickname: 'e2e-target', phone: '010-9000-0005', role: 'BUYER', trusted: true },
};

/** @typedef {keyof typeof ACCOUNTS} AccountKey */
export const ACCOUNT_KEYS = /** @type {AccountKey[]} */ (Object.keys(ACCOUNTS));

export function authFile(/** @type {AccountKey} */ key) {
    return path.join(AUTH_DIR, `${key}.json`);
}

function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * 테스트 대상 주소. `E2E_BASE_URL`이 `E2E_ALLOWED_ORIGINS`(쉼표로 구분한 origin 목록) 안에 있을 때만 돌려준다.
 * 목록이 비었거나 밖의 주소면 멈춘다. 운영이 아닌 곳에 실수로 쓰거나, 엉뚱한 사이트에 로그인하는 것을 막는다.
 */
export function resolveBaseUrl() {
    const raw = process.env.E2E_BASE_URL?.trim();
    const allowedRaw = process.env.E2E_ALLOWED_ORIGINS?.trim();
    if (!raw) throw new Error('E2E_BASE_URL이 없습니다. .env.e2e에 대상 주소를 적으세요(.env.e2e.example 참고).');
    if (!allowedRaw) throw new Error('E2E_ALLOWED_ORIGINS가 없습니다. 테스트해도 되는 origin 목록을 .env.e2e에 적으세요.');
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('E2E_BASE_URL이 올바른 주소가 아닙니다.');
    }
    if (url.pathname !== '/' || url.search || url.hash || url.username) {
        throw new Error('E2E_BASE_URL은 origin만 적습니다(경로 · 쿼리 · 계정 정보 없이).');
    }
    if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
        throw new Error('E2E_BASE_URL은 https여야 합니다(로컬 주소만 http 허용).');
    }
    const allowed = allowedRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => new URL(s).origin);
    if (!allowed.includes(url.origin)) {
        throw new Error(`E2E_BASE_URL(${url.origin})이 E2E_ALLOWED_ORIGINS 목록 밖이라 멈춥니다.`);
    }
    return { origin: url.origin, hostname: url.hostname, isHttps: url.protocol === 'https:' };
}

/** 테스트 계정 공통 비밀번호. bootstrap이 해시해 넣고, 로그인 때 쓴다. */
export function resolvePassword() {
    const value = process.env.E2E_PASSWORD;
    if (!value || value.length < 12) throw new Error('E2E_PASSWORD(12자 이상)가 필요합니다. .env.e2e에 적으세요.');
    return value;
}

/**
 * 서비스별 DB 접속 정보. `mysql://user:password@host:port/db[?ssl=true]` 형식.
 * 운영은 서비스별 DB(cartmate_member · cartmate_payment)다. 로그에는 비밀번호를 찍지 않는다.
 */
export function resolveDb(/** @type {'MEMBER' | 'PAYMENT'} */ service) {
    const name = `E2E_DB_${service}_URL`;
    const raw = process.env[name]?.trim();
    if (!raw) throw new Error(`${name}이 없습니다. .env.e2e에 mysql://user:password@host:port/db 형식으로 적으세요.`);
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`${name} 형식이 올바르지 않습니다.`);
    }
    if (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2) {
        throw new Error(`${name}은 mysql://user:password@host:port/db 형식이어야 합니다.`);
    }
    return {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.slice(1)),
        ssl: url.searchParams.get('ssl') === 'true' ? {} : undefined,
    };
}
