'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import {
    getGetDownloadableCouponsQueryKey,
    getGetMyCouponsQueryKey,
    useDownloadCoupon,
    useGetDownloadableCoupons,
    useGetMyCoupons,
} from '@/api/generated/coupon-controller/coupon-controller';
import type { DownloadableCouponResponse, MemberCouponResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { conditionLabel, discountLabel, MEMBER_COUPON_STATUS, usablePeriodLabel } from '@/lib/coupon';
import { formatDateTime } from '@/lib/format';

type Tab = 'usable' | 'done';

// 마이페이지 쿠폰함: 위에는 받을 수 있는 쿠폰(받기), 아래는 내 쿠폰(사용 가능 / 사용·만료)
export default function CouponBox() {
    return (
        <div className="flex flex-col gap-space-xl">
            <DownloadableSection />
            <MyCouponSection />
        </div>
    );
}

function DownloadableSection() {
    const queryClient = useQueryClient();
    const query = useGetDownloadableCoupons(undefined, { query: { staleTime: 0 } });
    const coupons = query.data?.data ?? [];
    const [error, setError] = useState<string | null>(null);

    const download = useDownloadCoupon({
        mutation: {
            onSuccess: () => setError(null),
            onError: (e) => setError(errorMessage(e, '쿠폰을 받지 못했습니다.')),
            // 성공·실패(소진·이미 받음) 모두 남은 수량과 받은 표시가 바뀌었을 수 있어 다시 받는다
            onSettled: () => {
                void queryClient.invalidateQueries({ queryKey: getGetDownloadableCouponsQueryKey() });
                void queryClient.invalidateQueries({ queryKey: getGetMyCouponsQueryKey() });
            },
        },
    });
    const downloadingId = download.isPending ? download.variables?.couponId : undefined;

    return (
        <section className="flex flex-col gap-space-sm" aria-label="받을 수 있는 쿠폰">
            <Heading level={2}>받을 수 있는 쿠폰</Heading>
            {error && <p className="font-body-sm text-body-sm text-error" role="alert">{error}</p>}
            {query.isPending ? (
                <div className="h-28 rounded bg-surface-container animate-pulse" aria-hidden />
            ) : query.isError ? (
                <Text color="secondary">{errorMessage(query.error, '쿠폰을 불러오지 못했습니다.')}</Text>
            ) : coupons.length === 0 ? (
                <Card padding={4}><Text color="secondary">지금 받을 수 있는 쿠폰이 없습니다.</Text></Card>
            ) : (
                <div className="grid gap-space-sm sm:grid-cols-2">
                    {coupons.map((c) => (
                        <DownloadableCard
                            key={c.couponId}
                            coupon={c}
                            loading={downloadingId === c.couponId}
                            onDownload={() => c.couponId !== undefined && download.mutate({ couponId: c.couponId })}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function DownloadableCard({ coupon, loading, onDownload }: { coupon: DownloadableCouponResponse; loading: boolean; onDownload: () => void }) {
    const soldOut = coupon.remaining === 0;
    return (
        <Card padding={4} className="flex items-center gap-space-md border-l-4 border-l-primary">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Text weight="semibold" className="text-primary text-lg">{discountLabel(coupon)}</Text>
                <Text weight="semibold" className="line-clamp-1">{coupon.name}</Text>
                <Text type="supporting" color="secondary">{conditionLabel(coupon)}</Text>
                <Text type="supporting" color="secondary">
                    {usablePeriodLabel(coupon)}
                    {coupon.issueEndAt && ` · ${formatDateTime(coupon.issueEndAt)}까지 받기`}
                    {coupon.remaining != null && ` · 남은 수량 ${coupon.remaining.toLocaleString('ko-KR')}장`}
                </Text>
            </div>
            <Button
                label={coupon.downloaded ? '받음' : soldOut ? '소진' : '받기'}
                size="sm"
                variant={coupon.downloaded || soldOut ? 'secondary' : 'primary'}
                icon={<Icon name={coupon.downloaded ? 'check' : 'download'} className="text-[18px]" />}
                isLoading={loading}
                isDisabled={coupon.downloaded || soldOut}
                onClick={onDownload}
            />
        </Card>
    );
}

function MyCouponSection() {
    const [tab, setTab] = useState<Tab>('usable');
    const query = useGetMyCoupons({ query: { staleTime: 0 } });
    const all = query.data?.data ?? [];
    const usable = all.filter((c) => c.status === 'AVAILABLE' || c.status === 'RESERVED');
    const done = all.filter((c) => c.status === 'USED' || c.status === 'EXPIRED');
    const shown = tab === 'usable' ? usable : done;

    return (
        <section className="flex flex-col gap-space-sm" aria-label="내 쿠폰">
            <Heading level={2}>내 쿠폰</Heading>
            <div className="flex gap-space-xs border-b border-outline-variant" role="tablist">
                <TabButton active={tab === 'usable'} label={`사용 가능 ${usable.length}`} onClick={() => setTab('usable')} />
                <TabButton active={tab === 'done'} label={`사용·만료 ${done.length}`} onClick={() => setTab('done')} />
            </div>
            {query.isPending ? (
                <div className="flex flex-col gap-space-sm" aria-hidden>
                    {[0, 1].map((n) => <div key={n} className="h-24 rounded bg-surface-container animate-pulse" />)}
                </div>
            ) : query.isError ? (
                <EmptyState
                    title="쿠폰함을 불러오지 못했습니다"
                    description={errorMessage(query.error, '잠시 후 다시 시도해주세요.')}
                    actions={<Button label="다시 시도" variant="secondary" onClick={() => void query.refetch()} />}
                />
            ) : shown.length === 0 ? (
                <Card padding={4}>
                    <Text color="secondary">{tab === 'usable' ? '사용할 수 있는 쿠폰이 없습니다. 위에서 쿠폰을 받아 보세요.' : '사용했거나 기간이 지난 쿠폰이 없습니다.'}</Text>
                </Card>
            ) : (
                <div className="flex flex-col gap-space-sm">
                    {shown.map((c) => <MyCouponRow key={c.memberCouponId} coupon={c} />)}
                </div>
            )}
            <Text type="supporting" color="secondary">쿠폰은 주문 결제 화면에서 한 주문에 한 장 쓸 수 있습니다. 결제 전에 주문이 취소되면 쿠폰은 그대로 남습니다.</Text>
        </section>
    );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className={`px-space-md py-space-sm font-label-md text-label-md -mb-px border-b-2 ${active ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function MyCouponRow({ coupon }: { coupon: MemberCouponResponse }) {
    const status = MEMBER_COUPON_STATUS[coupon.status ?? ''] ?? { label: coupon.status ?? '-', variant: 'neutral' as const };
    const inactive = coupon.status === 'USED' || coupon.status === 'EXPIRED';
    return (
        <Card padding={4} className={inactive ? 'opacity-60' : ''}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-space-md">
                <div className="w-32 shrink-0">
                    <Text weight="semibold" className={inactive ? 'text-lg' : 'text-primary text-lg'}>{discountLabel(coupon)}</Text>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-space-xs">
                        <Badge label={status.label} variant={status.variant} />
                        <Text weight="semibold" className="line-clamp-1">{coupon.name}</Text>
                    </div>
                    <Text type="supporting" color="secondary">{conditionLabel(coupon)}</Text>
                    <Text type="supporting" color="secondary">
                        {coupon.status === 'USED' ? `${formatDateTime(coupon.usedAt)} 사용` : `${formatDateTime(coupon.expiresAt)}까지`}
                    </Text>
                </div>
            </div>
        </Card>
    );
}
