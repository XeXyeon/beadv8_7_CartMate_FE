/** 실행 한 번을 가리키는 id. 제목에 붙여 자기 데이터만 찾는 데 쓴다(playwright.config.ts가 한 번 정해 워커에 넘긴다). */
export function runId(): string {
    return process.env.E2E_RUN_ID ?? 'local';
}

/** 제목 등에 붙일 이름: `이름 [e2e-<runId>]` */
export function withRunId(name: string): string {
    return `${name} [e2e-${runId()}]`;
}
