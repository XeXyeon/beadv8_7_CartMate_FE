'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Badge, Button, Card, Heading, Text } from '@astryxdesign/core';
import { useQueryClient } from '@tanstack/react-query';
import {
    getGetAdminCouponsQueryKey,
    useCreateCoupon,
    useGetAdminCoupons,
    useStopCoupon,
} from '@/api/generated/admin-coupon-controller/admin-coupon-controller';
import { getGetDownloadableCouponsQueryKey } from '@/api/generated/coupon-controller/coupon-controller';
import type { AdminCouponResponse, CouponCreateRequest } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { conditionLabel, discountLabel, usablePeriodLabel } from '@/lib/coupon';
import { formatDateTime, toKstLocal } from '@/lib/format';
import { blurOnWheel } from '@/app/seller/products/new/_components/OptionTable';
import SellerPicker, { type PickedSeller } from './SellerPicker';

const PAGE_SIZE = 20;

type Form = {
    name: string;
    discountType: 'FIXED' | 'RATE';
    discountValue: string;
    maxDiscountAmount: string;
    minOrderAmount: string;
    scope: 'ALL' | 'SELLER';
    seller: PickedSeller | null;
    issueType: 'DOWNLOAD' | 'AUTO';
    issueStartAt: string;
    issueEndAt: string;
    periodType: 'UNTIL' | 'DAYS';
    usableUntil: string;
    validDays: string;
    totalQuantity: string;
};

const EMPTY: Form = {
    name: '',
    discountType: 'FIXED',
    discountValue: '',
    maxDiscountAmount: '',
    minOrderAmount: '0',
    scope: 'ALL',
    seller: null,
    issueType: 'DOWNLOAD',
    issueStartAt: '',
    issueEndAt: '',
    periodType: 'DAYS',
    usableUntil: '',
    validDays: '30',
    totalQuantity: '',
};

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const dateTime = (v: string) => (v ? `${v}:00` : undefined); // datetime-local(YYYY-MM-DDTHH:mm) → LocalDateTime

// 화면에서 먼저 막는 규칙. 최종 확인은 BE(Coupon.create)가 한다
function validate(f: Form): string | null {
    if (!f.name.trim()) return '쿠폰 이름을 입력해주세요.';
    const value = num(f.discountValue);
    if (!value || value <= 0) return '할인 값은 0보다 커야 합니다.';
    if (f.discountType === 'RATE' && value > 100) return '정률 할인은 100%를 넘을 수 없습니다.';
    // BE는 sellerId가 실제 판매자인지 확인하지 않아, 판매글 목록에서 고른 판매자(판매자 번호)만 받는다
    if (f.scope === 'SELLER' && !f.seller) return '판매자 쿠폰은 판매자를 검색해서 골라 주세요.';
    if (f.periodType === 'UNTIL' && !f.usableUntil) return '사용 마감 일시를 입력해주세요.';
    if (f.periodType === 'DAYS' && !(num(f.validDays) && num(f.validDays)! > 0)) return '발급 후 사용 일수는 1일 이상이어야 합니다.';
    if (f.issueStartAt && f.issueEndAt && f.issueEndAt < f.issueStartAt) return '발급 종료가 시작보다 빠릅니다.';
    // BE가 확인하지 않는 날짜 관계(BE:ISS-45). 받자마자 만료된 쿠폰이 나가지 않게 막는다. 모두 한국 시간 문자열끼리 비교한다
    const now = toKstLocal(new Date());
    if (f.issueEndAt && f.issueEndAt <= now) return '발급 종료가 이미 지났습니다.';
    if (f.periodType === 'UNTIL') {
        if (f.usableUntil <= now) return '사용 마감이 이미 지났습니다.';
        if (f.issueStartAt && f.usableUntil <= f.issueStartAt) return '사용 마감은 발급 시작 뒤여야 합니다.';
        // BE는 발급할 때 사용 마감을 보지 않아, 발급 종료가 없으면 사용 마감이 지난 뒤에도 쿠폰이 나간다
        if (!f.issueEndAt) return '사용 마감을 정했으면 발급 종료도 정해 주세요. 비워 두면 사용 마감이 지난 뒤에도 발급됩니다.';
        if (f.usableUntil <= f.issueEndAt) {
            return '사용 마감은 발급 종료 뒤여야 합니다. 마지막에 받은 회원도 쓸 수 있게 정해 주세요.';
        }
    }
    return null;
}

function toRequest(f: Form): CouponCreateRequest {
    return {
        name: f.name.trim(),
        discountType: f.discountType,
        discountValue: Number(f.discountValue),
        maxDiscountAmount: f.discountType === 'RATE' ? num(f.maxDiscountAmount) : undefined,
        minOrderAmount: num(f.minOrderAmount) ?? 0,
        scope: f.scope,
        sellerId: f.scope === 'SELLER' ? f.seller?.id : undefined,
        issueType: f.issueType,
        autoTrigger: f.issueType === 'AUTO' ? 'SIGNUP' : undefined,
        issueStartAt: dateTime(f.issueStartAt),
        issueEndAt: dateTime(f.issueEndAt),
        usableUntil: f.periodType === 'UNTIL' ? dateTime(f.usableUntil) : undefined,
        validDays: f.periodType === 'DAYS' ? num(f.validDays) : undefined,
        totalQuantity: num(f.totalQuantity),
    };
}

// 만든 뒤 고칠 수 없어 제출 전에 할인 · 부담 · 기간 · 수량을 한 번 더 보여 준다
function confirmMessage(r: CouponCreateRequest, seller: PickedSeller | null): string {
    const lines = [
        `"${r.name}" 쿠폰을 만들까요?`,
        '',
        `할인: ${discountLabel(r)}${r.discountType === 'RATE' && r.maxDiscountAmount ? ` (최대 ${r.maxDiscountAmount.toLocaleString('ko-KR')}원)` : ''}${r.minOrderAmount ? ` · ${r.minOrderAmount.toLocaleString('ko-KR')}원 이상 구매 시` : ''}`,
        r.scope === 'SELLER'
            ? `범위: 판매자 ${seller?.name ? `${seller.name} ` : ''}(#${r.sellerId}) 상품 · 판매자 부담`
            : '범위: 전체 상품 · 플랫폼 부담',
        `발급: ${r.issueType === 'AUTO' ? '회원 가입 시 자동' : '직접 받기'}${r.issueEndAt ? ` · ${formatDateTime(r.issueEndAt)}까지` : ''}`,
        `사용: ${usablePeriodLabel(r)}`,
        `수량: ${r.totalQuantity ? `${r.totalQuantity.toLocaleString('ko-KR')}장` : '제한 없음'}`,
    ];
    if (r.discountType === 'RATE' && r.discountValue === 100 && !r.maxDiscountAmount) {
        lines.push('', '주의: 100% 할인에 최대 할인 금액이 없어 결제 금액이 0원이 됩니다. 0원 결제는 처리되지 않아 이 쿠폰으로는 결제할 수 없습니다.');
    }
    lines.push('', '만든 뒤에는 고칠 수 없고 발급 중지만 할 수 있습니다.');
    return lines.join('\n');
}

// 관리자 쿠폰 관리: 목록(발급·사용 수), 만들기, 발급 중지. 쿠폰은 수정·삭제하지 않는다(이미 받은 회원이 있어서)
export default function AdminCouponManager() {
    const queryClient = useQueryClient();
    const formRef = useRef<HTMLFormElement>(null);
    const [page, setPage] = useState(0);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<Form>(EMPTY);
    const [error, setError] = useState<string | null>(null);

    const list = useGetAdminCoupons({ page, size: PAGE_SIZE }, { query: { staleTime: 0 } });
    const coupons = list.data?.data?.content ?? [];
    const totalPages = list.data?.data?.totalPages ?? 0;

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: getGetAdminCouponsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDownloadableCouponsQueryKey() });
    };
    const closeForm = () => {
        setFormOpen(false);
        setForm(EMPTY);
        setError(null);
    };

    const create = useCreateCoupon({
        mutation: {
            onSuccess: () => { refresh(); closeForm(); setPage(0); },
            onError: (e) => setError(errorMessage(e, '쿠폰을 만들지 못했습니다.')),
        },
    });
    const stop = useStopCoupon({
        mutation: {
            onSuccess: () => refresh(),
            onError: (e) => alert(errorMessage(e, '발급을 중지하지 못했습니다.')),
        },
    });

    const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

    const openNew = () => {
        setForm(EMPTY);
        setError(null);
        setFormOpen(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    };

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        const problem = validate(form);
        if (problem) return setError(problem);
        setError(null);
        const data = toRequest(form);
        if (confirm(confirmMessage(data, form.seller))) create.mutate({ data });
    };

    const onStop = (c: AdminCouponResponse) => {
        if (c.id === undefined) return;
        if (confirm(`"${c.name}" 쿠폰 발급을 중지할까요?\n이미 받은 회원은 기간 안에 그대로 쓸 수 있고, 다시 발급할 수는 없습니다.`)) {
            stop.mutate({ couponId: c.id });
        }
    };

    return (
        <div className="flex flex-col gap-space-lg">
            <div className="flex flex-col items-start justify-between gap-space-md sm:flex-row sm:items-end">
                <div>
                    <Heading level={1}>쿠폰 관리</Heading>
                    <Text display="block" color="secondary" className="mt-2">
                        다운로드 쿠폰은 마이페이지 쿠폰함에 바로 보이고, 자동 발급(회원 가입) 쿠폰은 가입한 회원에게 발급됩니다.
                    </Text>
                </div>
                <Button label="새 쿠폰 만들기" type="button" variant="primary" onClick={openNew} icon={<Icon name="add" className="text-[18px]" />} />
            </div>

            {formOpen && (
                <Card className="border border-primary">
                    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-space-md">
                        <div className="flex items-center justify-between">
                            <Heading level={2}>새 쿠폰 만들기</Heading>
                            <Button label="닫기" type="button" variant="ghost" size="sm" onClick={closeForm} icon={<Icon name="close" className="text-[20px]" />} isIconOnly />
                        </div>

                        <Field label="쿠폰 이름">
                            <input className={INPUT} maxLength={100} placeholder="예: 신규 가입 3,000원 할인" value={form.name} onChange={(e) => set('name', e.target.value)} />
                        </Field>

                        <div className="grid gap-space-md sm:grid-cols-3">
                            <Field label="할인 방식">
                                <Segment
                                    value={form.discountType}
                                    options={[{ value: 'FIXED', label: '정액(원)' }, { value: 'RATE', label: '정률(%)' }]}
                                    onChange={(v) => set('discountType', v)}
                                />
                            </Field>
                            <Field label={form.discountType === 'RATE' ? '할인율 (%)' : '할인 금액 (원)'}>
                                <input className={INPUT} type="number" onWheel={blurOnWheel} min={1} max={form.discountType === 'RATE' ? 100 : undefined} value={form.discountValue} onChange={(e) => set('discountValue', e.target.value)} />
                            </Field>
                            {form.discountType === 'RATE' && (
                                <Field label="최대 할인 금액 (원, 선택)">
                                    <input className={INPUT} type="number" onWheel={blurOnWheel} min={1} placeholder="제한 없음" value={form.maxDiscountAmount} onChange={(e) => set('maxDiscountAmount', e.target.value)} />
                                </Field>
                            )}
                        </div>

                        <div className="grid gap-space-md sm:grid-cols-3">
                            <Field label="최소 주문 금액 (원)">
                                <input className={INPUT} type="number" onWheel={blurOnWheel} min={0} value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} />
                            </Field>
                            <Field label="적용 대상">
                                <Segment
                                    value={form.scope}
                                    options={[{ value: 'ALL', label: '전체 상품' }, { value: 'SELLER', label: '판매자 상품' }]}
                                    onChange={(v) => set('scope', v)}
                                />
                            </Field>
                        </div>
                        {form.scope === 'SELLER' && (
                            // 검색 칸 · 버튼이 들어 있어 label(Field)로 감싸지 않는다
                            <div className="flex flex-col gap-space-xs">
                                <span className="font-label-md text-label-md">판매자</span>
                                <SellerPicker value={form.seller} onChange={(seller) => set('seller', seller)} />
                            </div>
                        )}

                        <div className="grid gap-space-md sm:grid-cols-3">
                            <Field label="발급 방식">
                                <Segment
                                    value={form.issueType}
                                    options={[{ value: 'DOWNLOAD', label: '직접 받기' }, { value: 'AUTO', label: '회원 가입 시 자동' }]}
                                    onChange={(v) => set('issueType', v)}
                                />
                            </Field>
                            <Field label="발급 시작 (선택)">
                                <input className={INPUT} type="datetime-local" value={form.issueStartAt} onChange={(e) => set('issueStartAt', e.target.value)} />
                            </Field>
                            <Field label="발급 종료 (선택)">
                                <input className={INPUT} type="datetime-local" value={form.issueEndAt} onChange={(e) => set('issueEndAt', e.target.value)} />
                            </Field>
                        </div>

                        <div className="grid gap-space-md sm:grid-cols-3">
                            <Field label="사용 기간">
                                <Segment
                                    value={form.periodType}
                                    options={[{ value: 'DAYS', label: '받은 날부터 N일' }, { value: 'UNTIL', label: '정한 날짜까지' }]}
                                    onChange={(v) => set('periodType', v)}
                                />
                            </Field>
                            {form.periodType === 'DAYS' ? (
                                <Field label="사용 일수">
                                    <input className={INPUT} type="number" onWheel={blurOnWheel} min={1} value={form.validDays} onChange={(e) => set('validDays', e.target.value)} />
                                </Field>
                            ) : (
                                <Field label="사용 마감">
                                    <input className={INPUT} type="datetime-local" value={form.usableUntil} onChange={(e) => set('usableUntil', e.target.value)} />
                                </Field>
                            )}
                            <Field label="총 발급 수량 (선택)">
                                <input className={INPUT} type="number" onWheel={blurOnWheel} min={1} placeholder="제한 없음" value={form.totalQuantity} onChange={(e) => set('totalQuantity', e.target.value)} />
                            </Field>
                        </div>

                        <Text type="supporting" color="secondary">
                            전체 상품 쿠폰은 플랫폼이, 판매자 상품 쿠폰은 그 판매자가 할인을 부담합니다. 만든 뒤에는 수정할 수 없고 발급 중지만 할 수 있습니다.
                        </Text>
                        {error && <Text className="text-error" role="alert">{error}</Text>}

                        <div className="flex justify-end gap-space-sm">
                            <Button label="취소" type="button" variant="secondary" onClick={closeForm} />
                            <Button label={create.isPending ? '만드는 중…' : '쿠폰 만들기'} type="submit" variant="primary" isDisabled={create.isPending} />
                        </div>
                    </form>
                </Card>
            )}

            <Card padding={0} className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant font-label-sm text-label-sm">
                            <th className="py-space-sm px-space-md w-16 text-center">번호</th>
                            <th className="py-space-sm px-space-md">쿠폰</th>
                            <th className="py-space-sm px-space-md w-28 text-center">발급 방식</th>
                            <th className="py-space-sm px-space-md w-48">발급 기간 · 사용 기간</th>
                            <th className="py-space-sm px-space-md w-32 text-right">발급 / 사용</th>
                            <th className="py-space-sm px-space-md w-24 text-center">상태</th>
                            <th className="py-space-sm px-space-md w-28 text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="font-body-sm text-body-sm divide-y divide-surface-container">
                        {list.isPending ? (
                            <tr><td colSpan={7} className="py-space-xl text-center text-outline">불러오는 중…</td></tr>
                        ) : list.isError ? (
                            <tr><td colSpan={7} className="py-space-xl text-center text-error">{errorMessage(list.error, '쿠폰을 불러오지 못했습니다.')}</td></tr>
                        ) : coupons.length === 0 ? (
                            <tr><td colSpan={7} className="py-space-xl text-center text-outline">만든 쿠폰이 없습니다.</td></tr>
                        ) : (
                            coupons.map((c) => (
                                <tr key={c.id} className="hover:bg-surface-container-low">
                                    <td className="py-space-sm px-space-md text-center font-mono text-outline">{c.id}</td>
                                    <td className="py-space-sm px-space-md">
                                        <div className="font-label-md text-label-md text-on-surface">{c.name}</div>
                                        <div className="text-primary font-semibold">{discountLabel(c)}</div>
                                        <div className="text-outline">{conditionLabel(c, 'admin')}</div>
                                    </td>
                                    <td className="py-space-sm px-space-md text-center">
                                        <Badge label={c.issueType === 'AUTO' ? '가입 자동' : '직접 받기'} variant={c.issueType === 'AUTO' ? 'purple' : 'blue'} />
                                    </td>
                                    <td className="py-space-sm px-space-md text-outline">
                                        <div>발급 {c.issueStartAt || c.issueEndAt ? `${c.issueStartAt ? formatDateTime(c.issueStartAt) : '즉시'} ~ ${c.issueEndAt ? formatDateTime(c.issueEndAt) : ''}` : '제한 없음'}</div>
                                        <div>사용 {c.usableUntil ? `${formatDateTime(c.usableUntil)}까지` : `받은 날부터 ${c.validDays}일`}</div>
                                    </td>
                                    <td className="py-space-sm px-space-md text-right">
                                        <div className="text-on-surface">
                                            {(c.issuedCount ?? 0).toLocaleString('ko-KR')}
                                            {c.totalQuantity != null && <span className="text-outline"> / {c.totalQuantity.toLocaleString('ko-KR')}</span>}
                                        </div>
                                        <div className="text-outline">사용 {(c.usedCount ?? 0).toLocaleString('ko-KR')}</div>
                                    </td>
                                    <td className="py-space-sm px-space-md text-center">
                                        <StatusBadge coupon={c} />
                                    </td>
                                    <td className="py-space-sm px-space-md text-center">
                                        {c.status === 'ACTIVE' && (
                                            <Button label="발급 중지" type="button" variant="destructive" size="sm" isDisabled={stop.isPending} onClick={() => onStop(c)} />
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </Card>

            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-space-xs" aria-label="페이지">
                    <Button label="이전 페이지" variant="secondary" size="sm" isIconOnly icon={<Icon name="chevron_left" className="text-[18px]" />} isDisabled={page === 0} onClick={() => setPage((v) => v - 1)} />
                    <Text type="supporting" color="secondary" className="px-space-sm">{page + 1} / {totalPages}</Text>
                    <Button label="다음 페이지" variant="secondary" size="sm" isIconOnly icon={<Icon name="chevron_right" className="text-[18px]" />} isDisabled={page >= totalPages - 1} onClick={() => setPage((v) => v + 1)} />
                </nav>
            )}
        </div>
    );
}

// 총 수량을 다 발급했으면 발급 중이어도 더 받을 수 없어 "소진"으로 보인다
function StatusBadge({ coupon: c }: { coupon: AdminCouponResponse }) {
    if (c.status !== 'ACTIVE') return <Badge label="발급 중지" variant="neutral" />;
    const soldOut = c.totalQuantity != null && (c.issuedCount ?? 0) >= c.totalQuantity;
    return soldOut ? <Badge label="소진" variant="neutral" /> : <Badge label="발급 중" variant="success" />;
}

const INPUT = 'h-10 w-full px-space-sm border border-outline-variant rounded bg-surface-container-lowest font-body-sm text-body-sm outline-none focus:border-primary';

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-space-xs font-label-md text-label-md">
            {label}
            {children}
        </label>
    );
}

function Segment<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
        <div className="flex h-10 rounded border border-outline-variant overflow-hidden" role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={`flex-1 px-space-sm font-body-sm text-body-sm ${value === o.value ? 'bg-primary text-on-primary font-semibold' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
