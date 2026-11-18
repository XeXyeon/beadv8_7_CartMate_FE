// 한 번 충전 금액 규칙. BE 충전 주문과 같은 값이라 바꿀 때는 BE도 같이 바꾼다.
export const CHARGE_MIN = 10_000;
export const CHARGE_MAX = 1_000_000;
export const CHARGE_UNIT = 1_000;
export const CHARGE_PRESETS = [10_000, 50_000, 100_000] as const;
export const CHARGE_AMOUNT_RULE_MESSAGE = '충전 금액은 10,000원 이상 1,000,000원 이하, 1,000원 단위로 입력해주세요.';

// 통과하면 null, 아니면 화면에 보여 줄 이유
export function validateChargeAmount(amount: number | null): string | null {
    if (amount === null || !Number.isInteger(amount)) return '충전할 금액을 입력해주세요.';
    if (amount < CHARGE_MIN) return '10,000원 이상 충전할 수 있습니다.';
    if (amount > CHARGE_MAX) return '한 번에 1,000,000원까지 충전할 수 있습니다.';
    if (amount % CHARGE_UNIT !== 0) return '1,000원 단위로 입력해주세요.';
    return null;
}
