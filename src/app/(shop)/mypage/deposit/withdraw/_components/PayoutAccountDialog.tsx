'use client';

import { useState } from 'react';
import { Banner, Button, Dialog, DialogHeader, Text } from '@astryxdesign/core';
import { useQueryClient } from '@tanstack/react-query';
import {
    getMyPayoutAccountQueryKey,
    useRegisterPayoutAccount,
    useRegisterPayoutAccountFromSeller,
    useSendPayoutAccountCode,
    useVerifyPayoutAccountCode,
} from '@/api/generated/member-payout-account-controller/member-payout-account-controller';
import { errorMessage } from '@/api/http';
import { ACCOUNT_NUMBER_REGEX, BANKS } from '@/lib/withdraw';

const INPUT_CLASS =
    'h-10 w-full px-space-md border border-outline-variant rounded bg-surface-container-lowest font-body-sm text-on-surface focus:border-primary outline-none transition-colors disabled:bg-surface-container disabled:text-outline';
const LABEL_CLASS = 'font-body-sm text-body-sm text-on-surface font-bold';

type Props = {
    // 이미 등록된 계좌가 있으면 "변경"
    isChange: boolean;
    onClose: () => void;
};

// 출금 계좌 등록·변경 (2단계): ① 가입 이메일로 받은 인증번호 확인 → ② 본인 명의 계좌 입력(실명 확인) 또는 판매자 정산 계좌 사용.
// 인증 한 번에 등록 한 번. 등록·변경되면 서버가 알림 메일을 보낸다.
export default function PayoutAccountDialog({ isChange, onClose }: Props) {
    const queryClient = useQueryClient();
    const [step, setStep] = useState<'code' | 'account'>('code');
    const [sent, setSent] = useState(false);
    const [code, setCode] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const done = () => {
        void queryClient.invalidateQueries({ queryKey: getMyPayoutAccountQueryKey() });
        onClose();
    };
    const fail = (fallback: string) => (e: unknown) => setError(errorMessage(e, fallback));

    const send = useSendPayoutAccountCode({
        mutation: {
            onSuccess: (res) => {
                setSent(true);
                setError(null);
                const seconds = res.data ?? 300;
                setNotice(`가입한 이메일로 인증번호를 보냈습니다. ${Math.round(seconds / 60)}분 안에 입력해주세요.`);
            },
            onError: fail('인증번호를 보내지 못했습니다.'),
        },
    });
    const verify = useVerifyPayoutAccountCode({
        mutation: {
            onSuccess: () => {
                setError(null);
                setNotice(null);
                setStep('account');
            },
            onError: fail('인증번호를 확인하지 못했습니다.'),
        },
    });
    const register = useRegisterPayoutAccount({ mutation: { onSuccess: done, onError: fail('계좌를 등록하지 못했습니다.') } });
    const fromSeller = useRegisterPayoutAccountFromSeller({ mutation: { onSuccess: done, onError: fail('정산 계좌를 가져오지 못했습니다.') } });

    const busy = send.isPending || verify.isPending || register.isPending || fromSeller.isPending;
    const accountValid = bankName !== '' && accountHolder.trim() !== '' && ACCOUNT_NUMBER_REGEX.test(accountNumber);

    function close() {
        if (!busy) onClose();
    }

    function submitAccount() {
        if (!accountValid) {
            setError('은행, 예금주, 계좌번호(숫자 10~16자리)를 모두 입력해주세요.');
            return;
        }
        setError(null);
        register.mutate({ data: { bankName, accountHolder: accountHolder.trim(), accountNumber } });
    }

    function applySellerAccount() {
        if (confirm('판매자 등록 때 확인한 정산 계좌를 출금 계좌로 쓸까요?')) {
            setError(null);
            fromSeller.mutate();
        }
    }

    return (
        <Dialog isOpen onOpenChange={(open) => !open && close()} purpose="form" width={480}>
            <DialogHeader
                title={isChange ? '출금 계좌 변경' : '출금 계좌 등록'}
                subtitle={step === 'code' ? '1/2 · 이메일 인증' : '2/2 · 본인 명의 계좌 입력'}
                onOpenChange={(open) => !open && close()}
            />
            <div className="flex flex-col gap-space-md p-space-lg">
                {step === 'code' ? (
                    <>
                        <Text type="supporting">
                            출금 계좌를 바꾸려면 가입한 이메일로 받은 인증번호를 확인해야 합니다. 다른 사람이 내 계좌를 바꾸지 못하게 하기 위해서입니다.
                        </Text>
                        <Button
                            label={sent ? '인증번호 다시 받기' : '인증번호 받기'}
                            variant={sent ? 'secondary' : 'primary'}
                            isLoading={send.isPending}
                            isDisabled={busy}
                            onClick={() => send.mutate()}
                        />
                        {sent && (
                            <div className="flex flex-col gap-space-xs">
                                <label htmlFor="payout-code" className={LABEL_CLASS}>
                                    인증번호
                                </label>
                                <div className="flex gap-space-sm">
                                    <input
                                        id="payout-code"
                                        className={`${INPUT_CLASS} flex-1`}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        placeholder="숫자 6자리"
                                        maxLength={6}
                                        value={code}
                                        disabled={busy}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                    />
                                    <Button
                                        label="확인"
                                        variant="primary"
                                        isLoading={verify.isPending}
                                        isDisabled={busy || code.length !== 6}
                                        onClick={() => verify.mutate({ data: { code } })}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex flex-col gap-space-xs">
                            <label htmlFor="payout-bank" className={LABEL_CLASS}>
                                은행
                            </label>
                            <select id="payout-bank" className={INPUT_CLASS} value={bankName} disabled={busy} onChange={(e) => setBankName(e.target.value)}>
                                <option value="">은행 선택</option>
                                {BANKS.map((bank) => (
                                    <option key={bank} value={bank}>
                                        {bank}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-space-xs">
                            <label htmlFor="payout-holder" className={LABEL_CLASS}>
                                예금주
                            </label>
                            <input
                                id="payout-holder"
                                className={INPUT_CLASS}
                                maxLength={50}
                                placeholder="은행에 등록된 이름 그대로"
                                value={accountHolder}
                                disabled={busy}
                                onChange={(e) => setAccountHolder(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-space-xs">
                            <label htmlFor="payout-number" className={LABEL_CLASS}>
                                계좌번호
                            </label>
                            <input
                                id="payout-number"
                                className={INPUT_CLASS}
                                inputMode="numeric"
                                placeholder="숫자만 입력"
                                maxLength={16}
                                value={accountNumber}
                                disabled={busy}
                                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                            />
                        </div>
                        <Banner
                            status="info"
                            collapsible={false}
                            title="본인 명의 계좌만 등록할 수 있습니다"
                            description="은행에 예금주를 확인합니다. 등록·변경하면 가입한 이메일로 알림이 갑니다."
                        />
                        <div className="flex flex-col-reverse gap-space-sm sm:flex-row sm:justify-between">
                            {/* 판매자가 아니면 서버가 "등록된 정산 계좌가 없습니다"로 답한다 */}
                            <Button label="판매자 정산 계좌 사용" variant="secondary" isLoading={fromSeller.isPending} isDisabled={busy} onClick={applySellerAccount} />
                            <Button label={isChange ? '계좌 변경' : '계좌 등록'} variant="primary" isLoading={register.isPending} isDisabled={busy} onClick={submitAccount} />
                        </div>
                    </>
                )}

                {notice && <Text type="supporting">{notice}</Text>}
                {error && (
                    <Text type="supporting" color="inherit">
                        <span className="text-error" role="alert">
                            {error}
                        </span>
                    </Text>
                )}
            </div>
        </Dialog>
    );
}
