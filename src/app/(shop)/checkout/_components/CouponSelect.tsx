'use client';

import Link from 'next/link';
import { useGetOrderCouponOptions } from '@/api/generated/order-controller/order-controller';
import type { CouponOption } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import { conditionLabel, discountLabel } from '@/lib/coupon';
import { formatDateTime } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { formatPrice } from '@/lib/salesPost';

type Props = {
    orderId: number;
    selected: number | null;
    onChange: (memberCouponId: number | null) => void;
    disabled?: boolean;
};

// 결제 화면 쿠폰 선택. 주문 하나에 한 장. 쓸 수 없는 쿠폰은 회색으로 이유를 보여 준다(BE가 판단).
// 예상 할인액은 BE가 이 주문으로 계산한 값이고, 실제 결제 금액은 미리보기(memberCouponId 반영)로 다시 받는다.
export default function CouponSelect({ orderId, selected, onChange, disabled = false }: Props) {
    const query = useGetOrderCouponOptions(orderId, { query: { staleTime: 0 } });
    const options = query.data?.data ?? [];
    const usableCount = options.filter((o) => o.usable).length;

    return (
        <section className="border border-outline-variant p-space-md flex flex-col gap-space-sm" aria-label="쿠폰">
            <div className="flex items-center justify-between gap-space-sm">
                <h3 className="font-label-md text-label-md text-primary font-bold">쿠폰</h3>
                {!query.isPending && (
                    <span className="font-caption text-caption text-secondary">
                        사용 가능 {usableCount}장 ·{' '}
                        <Link className="underline" href={ROUTES.myCoupons}>쿠폰함</Link>
                    </span>
                )}
            </div>
            {query.isPending ? (
                <div className="h-12 bg-surface-container-low animate-pulse" aria-hidden />
            ) : query.isError ? (
                <p className="font-body-sm text-body-sm text-error">{errorMessage(query.error, '쿠폰을 불러오지 못했습니다. 쿠폰 없이 결제할 수 있습니다.')}</p>
            ) : options.length === 0 ? (
                <p className="font-body-sm text-body-sm text-secondary">가진 쿠폰이 없습니다.</p>
            ) : (
                <ul className="flex flex-col gap-space-xs" role="radiogroup" aria-label="쓸 쿠폰">
                    <CouponRadio checked={selected === null} disabled={disabled} onSelect={() => onChange(null)}>
                        <span className="font-body-sm text-body-sm text-on-surface">쿠폰 쓰지 않기</span>
                    </CouponRadio>
                    {options.map((o) => (
                        <CouponRadio
                            key={o.memberCouponId}
                            checked={selected === o.memberCouponId}
                            disabled={disabled || !o.usable}
                            onSelect={() => o.memberCouponId !== undefined && onChange(o.memberCouponId)}
                        >
                            <OptionText option={o} />
                        </CouponRadio>
                    ))}
                </ul>
            )}
        </section>
    );
}

function CouponRadio({ checked, disabled, onSelect, children }: { checked: boolean; disabled: boolean; onSelect: () => void; children: React.ReactNode }) {
    return (
        <li>
            <label
                className={`flex items-start gap-space-sm p-space-sm border rounded ${checked ? 'border-primary bg-surface-container-low' : 'border-outline-variant'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-container-low'}`}
            >
                <input type="radio" name="coupon" className="mt-1" checked={checked} disabled={disabled} onChange={onSelect} />
                <div className="min-w-0 flex-1">{children}</div>
            </label>
        </li>
    );
}

function OptionText({ option }: { option: CouponOption }) {
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-space-sm">
                <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">{option.name}</span>
                {option.usable ? (
                    <span className="font-label-md text-label-md text-primary font-bold shrink-0">-{formatPrice(option.expectedDiscount ?? 0)}</span>
                ) : (
                    <span className="font-caption text-caption text-error shrink-0">{option.unusableReason ?? '사용할 수 없어요'}</span>
                )}
            </div>
            <span className="font-caption text-caption text-secondary">
                {discountLabel(option)} · {conditionLabel(option)} · {formatDateTime(option.expiresAt)}까지
            </span>
        </div>
    );
}
