// 예치금 출금 · 출금 계좌 API.
// 생성 타입(orval)은 출금이 요청 → 확정 두 단계이던 옛 명세라, 지금 BE(요청 한 번에 잔액 차감, 이체는 비동기)대로 적는다. (QA-3#1 · QA-3#2)
// - 출금: payment 서비스 POST /api/wallets/me/withdraws
// - 출금 계좌: member 서비스 /api/members/me/payout-account (등록 · 변경 전 가입 이메일 인증 필요)
import { useQuery } from '@tanstack/react-query';
import { http, type RsData } from './http';

const json = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// BE 출금 상태. PENDING · PROCESSING은 잔액이 이미 빠졌고 이체가 진행 중, FAILED · CANCELED는 잔액이 돌아온다
export type WithdrawStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELED' | 'FAILED';

export type WithdrawOrder = {
    withdrawOrderId: number;
    amount: number;
    status: WithdrawStatus;
    statusLabel?: string;
    bankName?: string;
    accountNumberMasked?: string;
    // 실패 사유(FAILED일 때만)
    resultMessage?: string | null;
    requestedAt?: string;
    finishedAt?: string | null;
};

// 출금 신청. 신청하면 바로 잔액이 빠지고 이체는 BE가 따로 처리한다.
// 같은 멱등성 키로 다시 보내면 BE는 같은 출금 건을 돌려주고 다시 빼지 않는다.
export function requestWithdraw(body: { amount: number; idempotencyKey: string }) {
    return http<RsData<WithdrawOrder>>('/api/wallets/me/withdraws', json('POST', body));
}

export type PayoutAccount = {
    bankName: string;
    accountHolder: string;
    // 끝 4자리만 보이는 계좌번호
    maskedAccountNumber: string;
    updatedAt?: string;
};

// BE BankCode의 은행 이름. 판매자 신청 화면과 같은 목록이다
export const PAYOUT_BANKS = ['신한은행', '국민은행', '우리은행', '하나은행', '농협은행', '기업은행', '카카오뱅크', '토스뱅크'] as const;

// BE 규칙: 계좌번호는 숫자 10~16자리, 인증번호는 숫자 6자리
export const ACCOUNT_NUMBER_PATTERN = /^\d{10,16}$/;
export const EMAIL_CODE_PATTERN = /^\d{6}$/;

export const MY_PAYOUT_ACCOUNT_KEY = ['my-payout-account'];

// 내 출금 계좌. 등록 전이면 null
export function useMyPayoutAccount(enabled = true) {
    return useQuery({
        queryKey: MY_PAYOUT_ACCOUNT_KEY,
        queryFn: () => http<RsData<PayoutAccount | null>>('/api/members/me/payout-account').then((res) => res.data ?? null),
        enabled,
    });
}

// 가입 이메일로 인증번호를 보낸다. 돌려주는 값: 인증번호 유효 시간(초)
export function sendPayoutAccountCode() {
    return http<RsData<number>>('/api/members/me/payout-account/email-code', { method: 'POST' });
}

export function verifyPayoutAccountCode(code: string) {
    return http<RsData<null>>('/api/members/me/payout-account/email-code/verify', json('POST', { code }));
}

// 본인 명의 계좌 등록 · 변경. BE가 예금주 실명을 확인한다
export function registerPayoutAccount(body: { bankName: string; accountHolder: string; accountNumber: string }) {
    return http<RsData<PayoutAccount>>('/api/members/me/payout-account', json('PUT', body));
}

// 판매자: 판매자 등록 때 확인을 마친 정산 계좌를 출금 계좌로 쓴다
export function registerPayoutAccountFromSeller() {
    return http<RsData<PayoutAccount>>('/api/members/me/payout-account/from-seller', { method: 'PUT' });
}
