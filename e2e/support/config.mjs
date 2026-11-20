// E2E 공용 설정: .env.e2e 읽기, 로컬 전용 가드, 고정 테스트 계정표, DB 접속 정보.
// 대상은 로컬 도커의 운영 동등 환경(e2e/infra)이다. 로컬이 아닌 주소 · DB는 모두 거절한다.
// bootstrap(.mjs)과 Playwright(.ts)가 함께 쓰므로 JS로 둔다.
import { existsSync, readFileSync } from 'node:fs';
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
    // 관리자는 먼저 만든다: 빈 DB에서 id 1이 플랫폼 수수료 회원(PLATFORM_MEMBER_ID 기본 1)이어야 한다.
    admin: { email: 'e2e-admin@example.test', nickname: 'e2e-admin', phone: '010-9000-0004', role: 'ADMIN', trusted: false },
    buyer1: { email: 'e2e-buyer1@example.test', nickname: 'e2e-buyer1', phone: '010-9000-0001', role: 'BUYER', address: true, trusted: true },
    buyer2: { email: 'e2e-buyer2@example.test', nickname: 'e2e-buyer2', phone: '010-9000-0002', role: 'BUYER', address: true, trusted: true },
    seller: { email: 'e2e-seller@example.test', nickname: 'e2e-seller', phone: '010-9000-0003', role: 'SELLER', seller: true, trusted: true },
    // 회원 정지 · 탈퇴 신청/취소 대상. 테스트가 항상 원상 복구한다.
    target: { email: 'e2e-target@example.test', nickname: 'e2e-target', phone: '010-9000-0005', role: 'BUYER', trusted: true },
};

/** @typedef {keyof typeof ACCOUNTS} AccountKey */
export const ACCOUNT_KEYS = /** @type {AccountKey[]} */ (Object.keys(ACCOUNTS));

export function authFile(/** @type {AccountKey} */ key) {
    return path.join(AUTH_DIR, `${key}.json`);
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
export function isLocalHost(hostname) {
    return LOCAL_HOSTS.includes(hostname);
}

/** 테스트 대상 FE 주소. 기본 http://localhost:5173. 로컬이 아니면 멈춘다(운영 · 외부 사이트에 로그인하지 않게). */
export function resolveBaseUrl() {
    const raw = process.env.E2E_BASE_URL?.trim() || 'http://localhost:5173';
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('E2E_BASE_URL이 올바른 주소가 아닙니다.');
    }
    if (!isLocalHost(url.hostname)) throw new Error(`E2E_BASE_URL(${url.hostname})이 로컬 주소가 아니라 멈춥니다. E2E는 로컬 환경에서만 돈다.`);
    if (url.pathname !== '/' || url.search || url.hash || url.username) throw new Error('E2E_BASE_URL은 origin만 적습니다.');
    return { origin: url.origin, hostname: url.hostname, port: url.port || '80', isHttps: url.protocol === 'https:' };
}

/** 테스트 계정 공통 비밀번호(로컬 전용 값). 바꾸려면 `E2E_PASSWORD`(12자 이상)로 덮고 계정을 새로 만든다. */
export function resolvePassword() {
    const value = process.env.E2E_PASSWORD || 'e2e-Local-Passw0rd!';
    if (value.length < 12) throw new Error('E2E_PASSWORD는 12자 이상이어야 합니다.');
    return value;
}

// 로컬 도커(e2e/infra)의 서비스별 DB. 호스트 포트 · 계정은 compose.yaml과 같다.
const LOCAL_DB_DEFAULTS = {
    MEMBER: 'mysql://cartmate:cartmate@127.0.0.1:13306/cartmate_member',
    PAYMENT: 'mysql://cartmate:cartmate@127.0.0.1:13309/cartmate_payment',
};

/** 서비스별 DB 접속 정보. `E2E_DB_<MEMBER|PAYMENT>_URL`로 바꿀 수 있지만 호스트는 로컬이어야 한다. */
export function resolveDb(/** @type {'MEMBER' | 'PAYMENT'} */ service) {
    const name = `E2E_DB_${service}_URL`;
    const raw = process.env[name]?.trim() || LOCAL_DB_DEFAULTS[service];
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`${name} 형식이 올바르지 않습니다.`);
    }
    if (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2) {
        throw new Error(`${name}은 mysql://user:password@host:port/db 형식이어야 합니다.`);
    }
    if (!isLocalHost(url.hostname)) throw new Error(`${name}의 호스트(${url.hostname})가 로컬이 아니라 멈춥니다. E2E는 로컬 DB에만 쓴다.`);
    // 호스트만으로는 로컬 포트로 연 운영 터널(127.0.0.1:3306 등)을 못 거른다. compose의 MySQL 포트와 DB 이름도 확인한다.
    const port = Number(url.port || 3306);
    if (port < 13306 || port > 13310) throw new Error(`${name}의 포트(${port})가 E2E 로컬 DB 범위(13306~13310) 밖이라 멈춥니다.`);
    if (!decodeURIComponent(url.pathname.slice(1)).startsWith('cartmate_')) throw new Error(`${name}의 DB 이름은 cartmate_로 시작해야 합니다.`);
    return {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.slice(1)),
        ssl: undefined,
    };
}

/** 관리자 OTP 암호화 키(Base64 32바이트). 로컬 BE 기본값과 같다(compose가 같은 값을 명시). */
export function resolveOtpKey() {
    return process.env.E2E_OTP_ENCRYPTION_KEY || 'Y2FydG1hdGUtbG9jYWwtb3RwLWtleS0zMmJ5dGVzISE=';
}

export const ADMIN_OTP_SECRET_FILE = path.join(AUTH_DIR, 'admin-otp-secret.txt');

/** 관리자 OTP 비밀키(Base32). bootstrap이 만들어 e2e/.auth에 저장한다. */
export function adminOtpSecret() {
    // bootstrap이 만든 파일이 우선이다(예전 .env.e2e에 남은 다른 환경의 값에 끌려가지 않게).
    if (existsSync(ADMIN_OTP_SECRET_FILE)) return readFileSync(ADMIN_OTP_SECRET_FILE, 'utf8').trim();
    return process.env.E2E_ADMIN_OTP_SECRET?.trim() ?? '';
}

/** 로컬 BE 컨테이너 이름(docker logs용). */
export function memberContainer() {
    return process.env.E2E_MEMBER_CONTAINER || 'cartmate-e2e-member-service-1';
}
