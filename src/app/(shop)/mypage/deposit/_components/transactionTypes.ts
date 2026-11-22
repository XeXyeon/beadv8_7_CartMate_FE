export type TypeInfo = { label: string; title: string; sign: '+' | '-'; badgeClassName: string; amountClassName: string };

// BE 거래 유형별 표시. 금액은 항상 양수로 오므로 부호는 유형으로 정한다.
const TYPE_INFO: Record<string, TypeInfo> = {
    CHARGE: { label: '충전', title: '예치금 충전', sign: '+', badgeClassName: 'bg-surface-container-highest text-on-surface', amountClassName: 'text-primary' },
    USE: { label: '결제', title: '주문 결제', sign: '-', badgeClassName: 'bg-surface-container-high text-on-surface-variant', amountClassName: 'text-secondary' },
    REFUND: { label: '환불', title: '결제 취소 환불', sign: '+', badgeClassName: 'bg-surface-container-highest text-on-surface-variant', amountClassName: 'text-primary' },
    SETTLEMENT: { label: '정산', title: '판매 정산금 입금', sign: '+', badgeClassName: 'bg-surface-container text-on-surface', amountClassName: 'text-primary' },
    FEE: { label: '수수료', title: '판매 수수료 수입', sign: '+', badgeClassName: 'bg-surface-container text-on-surface', amountClassName: 'text-primary' },
    WITHDRAW: { label: '출금', title: '예치금 출금', sign: '-', badgeClassName: 'bg-surface-container-high text-on-surface-variant', amountClassName: 'text-secondary' },
    // 출금이 실패하거나 취소돼 잔액으로 돌아온 돈
    WITHDRAW_RESTORE: { label: '출금 취소', title: '출금 금액 복구', sign: '+', badgeClassName: 'bg-surface-container-highest text-on-surface-variant', amountClassName: 'text-primary' },
};

const UNKNOWN_TYPE: TypeInfo = { label: '기타', title: '거래', sign: '+', badgeClassName: 'bg-surface-container text-on-surface', amountClassName: 'text-on-surface' };

export function transactionTypeInfo(type: string | undefined): TypeInfo {
    return TYPE_INFO[type ?? ''] ?? UNKNOWN_TYPE;
}
