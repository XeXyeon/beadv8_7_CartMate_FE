// 예치금 출금 상태 표시 (회원 출금 내역 · 관리자 출금 처리 공통)
// BE: PENDING → PROCESSING → COMPLETED / FAILED, PENDING → CANCELED. 잔액은 신청할 때 빠지고 실패·취소되면 돌아온다
export type WithdrawStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELED' | 'FAILED';

type BadgeTone = 'warning' | 'info' | 'success' | 'neutral' | 'error';

export const WITHDRAW_STATUS: Record<WithdrawStatus, { label: string; variant: BadgeTone }> = {
    PENDING: { label: '출금 대기', variant: 'warning' },
    PROCESSING: { label: '송금 중', variant: 'info' },
    COMPLETED: { label: '출금 완료', variant: 'success' },
    CANCELED: { label: '취소', variant: 'neutral' },
    FAILED: { label: '출금 실패', variant: 'error' },
};

export function withdrawStatusInfo(status: string | undefined) {
    return WITHDRAW_STATUS[(status ?? '') as WithdrawStatus] ?? { label: status ?? '-', variant: 'neutral' as const };
}

// 출금 계좌로 받는 은행 (BE BankCode와 같은 목록)
export const BANKS = ['신한은행', '국민은행', '우리은행', '하나은행', '농협은행', '기업은행', '카카오뱅크', '토스뱅크'];

// BE MemberPolicy.ACCOUNT_NUMBER_REGEX와 같은 규칙
export const ACCOUNT_NUMBER_REGEX = /^\d{10,16}$/;
