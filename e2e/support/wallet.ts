import mysql from 'mysql2/promise';
import { ACCOUNTS, resolveBaseUrl, resolveDb, type AccountKey } from './config.mjs';

// 예치금 잔액 맞추기. 토스 결제창은 카드사 본인인증(앱 · 문자)을 거쳐 자동화할 수 없어(QA-3 E02 참고) 테스트가 쓸 잔액은 로컬 payment DB에 직접 넣는다.
// 로컬 DB에만 쓴다(config가 로컬이 아니면 거절). 대상은 고정 테스트 계정 하나로 좁히고, 값은 자리표시자(?)로만 넣는다.

async function connect(service: 'MEMBER' | 'PAYMENT') {
    resolveBaseUrl(); // 로컬이 아니면 멈춘다
    const { host, port, user, password, database } = resolveDb(service);
    return mysql.createConnection({ host, port, user, password, database });
}

/** 고정 계정의 회원 id(member DB에서 이메일로 찾는다). */
export async function memberIdOf(key: AccountKey): Promise<number> {
    const conn = await connect('MEMBER');
    try {
        const [rows] = await conn.query('SELECT id FROM member WHERE email = ?', [ACCOUNTS[key].email]);
        const id = (rows as { id: number }[])[0]?.id;
        if (!id) throw new Error(`${key}: member 행이 없습니다. \`npm run e2e:bootstrap\`을 실행하세요.`);
        return Number(id);
    } finally {
        await conn.end().catch(() => {});
    }
}

/** (거래내역 · 충전 합계는 맞추지 않는다: 그것을 검사하는 테스트에는 쓰지 말 것) 고정 계정의 예치금 잔액을 정확히 amount로 맞춘다(version도 올려 BE의 낙관적 잠금과 어긋나지 않게 한다). */
export async function setWalletBalance(key: AccountKey, amount: number): Promise<void> {
    if (key === 'admin') throw new Error('admin은 플랫폼 수수료 지갑이라 잔액을 바꾸지 않습니다.');
    if (!Number.isInteger(amount) || amount < 0 || amount > 10_000_000) throw new Error(`잔액 값이 올바르지 않습니다: ${amount}`);
    const memberId = await memberIdOf(key);
    const conn = await connect('PAYMENT');
    try {
        const [res] = await conn.query('UPDATE wallet SET balance = ?, version = version + 1, updated_at = NOW(6) WHERE member_id = ?', [amount, memberId]);
        if ((res as mysql.ResultSetHeader).affectedRows !== 1) throw new Error(`${key}: wallet 행이 없습니다. \`npm run e2e:bootstrap\`을 실행하세요.`);
    } finally {
        await conn.end().catch(() => {});
    }
}
