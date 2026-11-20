'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { ApiError, errorMessage } from '@/api/http';
import {
    ACCOUNT_NUMBER_PATTERN,
    EMAIL_CODE_PATTERN,
    MY_PAYOUT_ACCOUNT_KEY,
    PAYOUT_BANKS,
    registerPayoutAccount,
    registerPayoutAccountFromSeller,
    sendPayoutAccountCode,
    verifyPayoutAccountCode,
    type PayoutAccount,
} from '@/api/payout';
import { INPUT_CLASS } from '@/app/(shop)/checkout/_components/DeliveryAddressFields';
import { useMySellerId } from '@/lib/auth';

const LABEL_CLASS = 'font-label-md text-label-md text-on-surface';

type Props = {
    account: PayoutAccount | null | undefined;
    isLoading: boolean;
    loadError: unknown;
    onRetry: () => void;
};

// 출금 계좌 보기 · 등록 · 변경. (QA-3#2)
// BE 순서: 가입 이메일로 인증번호 받기 → 인증 → (인증이 유효한 동안) 본인 명의 계좌 등록. 판매자는 정산 계좌를 그대로 쓸 수 있다.
export default function PayoutAccountSection({ account, isLoading, loadError, onRetry }: Props) {
    const [editing, setEditing] = useState(false);

    if (isLoading) {
        return (
            <Card padding={5}>
                <Text type="supporting">출금 계좌를 불러오는 중…</Text>
            </Card>
        );
    }

    if (loadError && account === undefined) {
        return (
            <Card variant="red" padding={4} className="flex flex-col gap-3" role="alert">
                <Text>{errorMessage(loadError, '출금 계좌를 불러오지 못했습니다.')}</Text>
                <Button label="다시 시도" variant="secondary" size="sm" onClick={onRetry} />
            </Card>
        );
    }

    if (account && !editing) {
        return (
            <Card padding={5} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <Text weight="semibold">출금 계좌</Text>
                    <Button label="계좌 변경" variant="secondary" size="sm" onClick={() => setEditing(true)} />
                </div>
                <p className="font-body-md text-body-md text-on-surface">
                    {account.bankName} {account.maskedAccountNumber} · {account.accountHolder}
                </p>
                <Text type="supporting">출금하면 이 계좌로 보내 드립니다.</Text>
            </Card>
        );
    }

    return <PayoutAccountEditor hasAccount={Boolean(account)} onDone={() => setEditing(false)} />;
}

function PayoutAccountEditor({ hasAccount, onDone }: { hasAccount: boolean; onDone: () => void }) {
    const queryClient = useQueryClient();
    const { sellerId } = useMySellerId();
    const [step, setStep] = useState<'code' | 'form'>('code');
    const [codeSent, setCodeSent] = useState(false);
    const [code, setCode] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    // 같은 렌더 안의 연속 클릭도 막는다(인증번호 재발송 제한 · 실명 확인 횟수를 쓰지 않게)
    const inFlightRef = useRef(false);

    async function run(action: () => Promise<void>, fallback: string) {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (e) {
            // 인증이 풀렸으면(유효 시간이 지남) 인증번호부터 다시 받는다
            if (e instanceof ApiError && e.resultCode?.endsWith('PAYOUT_ACCOUNT_EMAIL_NOT_VERIFIED')) {
                setStep('code');
                setCodeSent(false);
                setCode('');
            }
            setError(errorMessage(e, fallback));
        } finally {
            inFlightRef.current = false;
            setBusy(false);
        }
    }

    const sendCode = () =>
        run(async () => {
            const res = await sendPayoutAccountCode();
            const minutes = res.data ? Math.max(1, Math.round(res.data / 60)) : null;
            setCodeSent(true);
            setNotice(`가입한 이메일로 인증번호를 보냈습니다.${minutes ? ` ${minutes}분 안에 입력해주세요.` : ''}`);
        }, '인증번호를 보내지 못했습니다. 잠시 후 다시 시도해주세요.');

    const verify = () =>
        run(async () => {
            await verifyPayoutAccountCode(code);
            setNotice(null);
            setStep('form');
        }, '인증번호를 확인하지 못했습니다.');

    const saved = (next: PayoutAccount | undefined) => {
        queryClient.setQueryData(MY_PAYOUT_ACCOUNT_KEY, next ?? null);
        void queryClient.invalidateQueries({ queryKey: MY_PAYOUT_ACCOUNT_KEY });
        onDone();
    };

    const register = () =>
        run(async () => {
            const res = await registerPayoutAccount({
                bankName,
                accountHolder: accountHolder.trim(),
                accountNumber,
            });
            saved(res.data);
        }, '출금 계좌를 등록하지 못했습니다.');

    const registerFromSeller = () =>
        run(async () => {
            const res = await registerPayoutAccountFromSeller();
            saved(res.data);
        }, '정산 계좌를 출금 계좌로 등록하지 못했습니다.');

    const accountNumberError = accountNumber && !ACCOUNT_NUMBER_PATTERN.test(accountNumber) ? '계좌번호는 숫자만 10~16자리로 입력해주세요.' : null;
    const canRegister = bankName !== '' && accountHolder.trim() !== '' && ACCOUNT_NUMBER_PATTERN.test(accountNumber);

    return (
        <Card padding={5} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <Text weight="semibold">{hasAccount ? '출금 계좌 변경' : '출금 계좌 등록'}</Text>
                {hasAccount ? <Button label="취소" variant="secondary" size="sm" isDisabled={busy} onClick={onDone} /> : null}
            </div>
            {!hasAccount ? <Text type="supporting">출금하려면 본인 명의 계좌를 먼저 등록해주세요.</Text> : null}

            {step === 'code' ? (
                <div className="flex flex-col gap-3">
                    <Text type="supporting">계좌를 등록 · 변경하려면 가입한 이메일로 받은 인증번호를 먼저 확인합니다.</Text>
                    <Button
                        label={codeSent ? '인증번호 다시 받기' : '인증번호 받기'}
                        variant="secondary"
                        isDisabled={busy}
                        onClick={sendCode}
                    />
                    {codeSent ? (
                        <div className="flex flex-col gap-2">
                            <label htmlFor="payout-email-code" className={LABEL_CLASS}>
                                인증번호
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="payout-email-code"
                                    className={`${INPUT_CLASS} flex-1`}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="숫자 6자리"
                                    maxLength={6}
                                    disabled={busy}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                />
                                <Button
                                    label="인증하기"
                                    variant="primary"
                                    isDisabled={busy || !EMAIL_CODE_PATTERN.test(code)}
                                    onClick={verify}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <Text type="supporting">이메일 인증을 마쳤습니다. 본인 명의 계좌만 등록할 수 있습니다.</Text>
                    {sellerId !== null ? (
                        <div className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
                            <Text type="supporting">판매자 등록 때 확인한 정산 계좌를 그대로 쓸 수 있습니다.</Text>
                            <Button label="정산 계좌로 등록" variant="secondary" isDisabled={busy} onClick={registerFromSeller} />
                        </div>
                    ) : null}
                    <div className="flex flex-col gap-2">
                        <label htmlFor="payout-bank" className={LABEL_CLASS}>
                            은행
                        </label>
                        <select
                            id="payout-bank"
                            className={INPUT_CLASS}
                            disabled={busy}
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                        >
                            <option value="">은행 선택</option>
                            {PAYOUT_BANKS.map((bank) => (
                                <option key={bank} value={bank}>
                                    {bank}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="payout-holder" className={LABEL_CLASS}>
                            예금주
                        </label>
                        <input
                            id="payout-holder"
                            className={INPUT_CLASS}
                            maxLength={50}
                            disabled={busy}
                            value={accountHolder}
                            onChange={(e) => setAccountHolder(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="payout-account-number" className={LABEL_CLASS}>
                            계좌번호
                        </label>
                        <input
                            id="payout-account-number"
                            className={INPUT_CLASS}
                            inputMode="numeric"
                            placeholder="- 없이 숫자만"
                            maxLength={16}
                            disabled={busy}
                            value={accountNumber}
                            aria-invalid={accountNumberError ? true : undefined}
                            onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 16))}
                        />
                        {accountNumberError ? (
                            <Text type="supporting" role="alert">
                                {accountNumberError}
                            </Text>
                        ) : null}
                    </div>
                    <Button
                        label="계좌 등록"
                        variant="primary"
                        isDisabled={busy || !canRegister}
                        isLoading={busy}
                        onClick={register}
                    />
                </div>
            )}

            {notice ? <Text type="supporting">{notice}</Text> : null}
            {error ? (
                <Card variant="red" padding={3} role="alert">
                    <Text>{error}</Text>
                </Card>
            ) : null}
        </Card>
    );
}
