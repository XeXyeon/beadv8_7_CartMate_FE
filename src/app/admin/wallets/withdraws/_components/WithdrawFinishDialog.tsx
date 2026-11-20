'use client';

import { useState } from 'react';
import { Banner, Button, Dialog, DialogHeader, TextArea } from '@astryxdesign/core';
import {
    useCompleteAdminWithdraw,
    useFailAdminWithdraw,
} from '@/api/generated/admin-wallet-withdraw-controller/admin-wallet-withdraw-controller';
import type { AdminWithdrawOrderResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import { formatPrice } from '@/lib/salesPost';

type Props = {
    kind: 'complete' | 'fail';
    order: AdminWithdrawOrderResponse;
    onClose: () => void;
    onDone: () => void;
};

// 완료: 송금했다(메모 선택, 이체 확인 번호 등). 실패: 송금하지 못했다(사유 필수, 회원에게 보임) → 잔액 복구
export default function WithdrawFinishDialog({ kind, order, onClose, onDone }: Props) {
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const onError = (e: unknown) => setError(errorMessage(e, kind === 'complete' ? '완료 처리하지 못했습니다.' : '실패 처리하지 못했습니다.'));
    const complete = useCompleteAdminWithdraw({ mutation: { onSuccess: onDone, onError } });
    const fail = useFailAdminWithdraw({ mutation: { onSuccess: onDone, onError } });
    const busy = complete.isPending || fail.isPending;
    const id = order.withdrawOrderId!;

    const submit = () => {
        if (kind === 'fail' && text.trim() === '') {
            setError('실패 사유를 입력해주세요. 회원 출금 내역에 보입니다.');
            return;
        }
        setError(null);
        if (kind === 'complete') {
            complete.mutate({ withdrawOrderId: id, data: { memo: text.trim() || undefined } });
        } else {
            fail.mutate({ withdrawOrderId: id, data: { reason: text.trim() } });
        }
    };

    return (
        <Dialog isOpen onOpenChange={(open) => !open && !busy && onClose()} purpose="form" width={440}>
            <DialogHeader
                title={kind === 'complete' ? '송금 완료 처리' : '출금 실패 처리'}
                subtitle={`#${id} · ${formatPrice(order.amount ?? 0)} · ${order.bankName ?? ''} ${order.accountNumberMasked ?? ''}`}
                onOpenChange={(open) => !open && !busy && onClose()}
            />
            <div className="flex flex-col gap-space-md p-space-lg">
                <TextArea
                    label={kind === 'complete' ? '메모 (선택)' : '실패 사유'}
                    placeholder={kind === 'complete' ? '이체 확인 번호 등' : '예: 수취 계좌 오류'}
                    value={text}
                    maxLength={200}
                    isRequired={kind === 'fail'}
                    isDisabled={busy}
                    status={error ? { type: 'error', message: error } : undefined}
                    onChange={(value) => {
                        setText(value);
                        setError(null);
                    }}
                />
                {kind === 'complete' ? (
                    <Banner status="warning" collapsible={false} title="은행에서 실제로 송금한 뒤에 눌러주세요" description="완료하면 되돌릴 수 없습니다." />
                ) : (
                    <Banner status="info" collapsible={false} title="금액은 회원 예치금으로 돌아갑니다" description="송금하지 않았을 때만 실패 처리하세요. 이미 송금했다면 완료를 눌러야 합니다." />
                )}
                <div className="flex justify-end gap-space-sm">
                    <Button label="닫기" isDisabled={busy} onClick={onClose} />
                    <Button
                        label={kind === 'complete' ? '완료 처리' : '실패 처리'}
                        variant={kind === 'complete' ? 'primary' : 'destructive'}
                        isLoading={busy}
                        onClick={submit}
                    />
                </div>
            </div>
        </Dialog>
    );
}
