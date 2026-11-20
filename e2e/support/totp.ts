import { createHmac } from 'node:crypto';

// BE 관리자 OTP와 같은 규칙: TOTP(RFC 6238), HMAC-SHA1 · 30초 · 6자리.
const STEP_SECONDS = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
    const clean = input.replace(/[\s=-]/g, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const ch of clean) {
        const idx = ALPHABET.indexOf(ch);
        if (idx < 0) throw new Error('E2E_ADMIN_OTP_SECRET이 Base32 형식이 아닙니다.');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

export function totpStep(nowMs = Date.now()): number {
    return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function totpMillisToNextStep(nowMs = Date.now()): number {
    return (totpStep(nowMs) + 1) * STEP_SECONDS * 1000 - nowMs;
}

export function totpCode(secretBase32: string, step = totpStep()): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 1_000_000).padStart(6, '0');
}
