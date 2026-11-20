import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { memberContainer, resolveBaseUrl } from './config.mjs';

const run = promisify(execFile);

// 메일 · 휴대폰 인증 코드는 member 서비스가 로그에만 남긴다(MAIL_ENABLED=false, 문자는 원래 로그뿐).
//   메일: "[인증 메일 — 발송 안 함] to=<이메일> subject=<제목>\n<본문>"  (본문에 6자리 코드)
//   문자: "[휴대폰 인증] <번호> → 인증번호 <코드> (<n>초 유효)"
// 코드는 Redis에 해시로만 있어 이 로그가 유일한 출처다. 로컬 환경(docker)에서만 동작한다.

async function memberLogs(sinceMs: number): Promise<string> {
    resolveBaseUrl(); // 로컬이 아니면 멈춘다
    const since = new Date(sinceMs - 2_000).toISOString();
    const { stdout, stderr } = await run('docker', ['logs', '--since', since, memberContainer()], { maxBuffer: 16 * 1024 * 1024 });
    return `${stdout}\n${stderr}`; // 컨테이너 로그는 stdout · stderr 어느 쪽이든 올 수 있다
}

/** 받는 사람의 가장 최근 메일 코드. 호출 전에 코드를 요청하고, `since`는 그 요청 직전 시각(Date.now())을 준다. */
export async function waitForMailCode(email: string, since: number, timeoutMs = 20_000): Promise<string> {
    return poll(async () => {
        const text = await memberLogs(since);
        const at = text.lastIndexOf(`to=${email} `);
        if (at < 0) return null;
        // 로그가 JSON이면 줄바꿈이 글자 그대로 `\n`으로 온다. 제목 줄 뒤(첫 줄바꿈 다음) 본문에서 처음 나오는 6자리 숫자를 읽는다.
        // JSON 로그의 message 값은 `"`에서 끝나므로 거기까지만 본다(뒤따르는 다른 필드의 숫자를 코드로 집지 않게).
        const rest = text.slice(at, at + 1_500).split(/(?<!\\)"/)[0];
        const body = /(?:\\n|\n)([\s\S]*)$/.exec(rest)?.[1];
        return body ? (/(?<!\d)(\d{6})(?!\d)/.exec(body)?.[1] ?? null) : null;
    }, `${email}로 보낸 메일 코드`, timeoutMs);
}

/** 번호의 가장 최근 휴대폰 인증 코드. 번호는 로그에 찍힌 형식(하이픈 포함 여부)과 같게 준다. */
export async function waitForPhoneCode(phone: string, since: number, timeoutMs = 20_000): Promise<string> {
    return poll(async () => {
        const text = await memberLogs(since);
        const matches = [...text.matchAll(/\[휴대폰 인증\] (\S+) → 인증번호 (\d{4,8})/g)].filter((m) => m[1] === phone);
        return matches.length ? matches[matches.length - 1][2] : null;
    }, `${phone}로 보낸 휴대폰 코드`, timeoutMs);
}

async function poll(read: () => Promise<string | null>, what: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`${what}를 member 로그에서 찾지 못했습니다(${timeoutMs}ms). 컨테이너 이름: ${memberContainer()}`);
        await new Promise((r) => setTimeout(r, 500));
    }
}
