'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import {
    getGetDownloadableCouponsQueryKey,
    getGetMyCouponsQueryKey,
    useDownloadCoupon,
    useGetDownloadableCoupons,
} from '@/api/generated/coupon-controller/coupon-controller';
import type { DownloadableCouponResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { conditionLabel, discountLabel, usablePeriodLabel } from '@/lib/coupon';
import { formatDateTime } from '@/lib/format';

type Props = {
    // 상품 상세: 그 판매자 id(전체 쿠폰 + 그 판매자 쿠폰). 쿠폰함: 비워서 받을 수 있는 쿠폰 전부
    sellerId?: number;
    // 받을 쿠폰이 없을 때 안내를 보일지(쿠폰함). 상품 상세는 칸째 그리지 않는다
    showEmpty?: boolean;
    // 좁은 칸(상품 상세 옆 칸)에서는 한 줄에 하나씩
    compact?: boolean;
    // 비로그인일 때: 받기 대신 이 주소(로그인 후 돌아올 곳을 담은 로그인 주소)로 보낸다
    loginHref?: string;
};

// 받을 수 있는 쿠폰 목록과 받기 버튼. 쿠폰함과 상품 상세가 함께 쓴다.
// 비로그인도 목록은 볼 수 있다(BE가 받음 여부를 모두 false로 준다). 받기는 로그인으로 안내한다.
export default function DownloadableCoupons({ sellerId, showEmpty = false, compact = false, loginHref }: Props) {
    const queryClient = useQueryClient();
    const query = useGetDownloadableCoupons(sellerId === undefined ? undefined : { sellerId }, { query: { staleTime: 0 } });
    const coupons = query.data?.data ?? [];
    const [error, setError] = useState<string | null>(null);

    const download = useDownloadCoupon({
        mutation: {
            onSuccess: () => setError(null),
            onError: (e) => setError(errorMessage(e, '쿠폰을 받지 못했습니다.')),
            // 성공·실패(소진·이미 받음) 모두 남은 수량과 받은 표시가 바뀌었을 수 있어 다시 받는다.
            // 받기 목록은 sellerId별로 키가 나뉘어 앞부분으로 모두 무효화한다
            onSettled: () => {
                void queryClient.invalidateQueries({ queryKey: getGetDownloadableCouponsQueryKey() });
                void queryClient.invalidateQueries({ queryKey: getGetMyCouponsQueryKey() });
            },
        },
    });
    const downloadingId = download.isPending ? download.variables?.couponId : undefined;

    return (
        <>
            {error && <p className="font-body-sm text-body-sm text-error" role="alert">{error}</p>}
            {query.isPending ? (
                <div className="h-28 rounded bg-surface-container animate-pulse" aria-hidden />
            ) : query.isError ? (
                <Text color="secondary">{errorMessage(query.error, '쿠폰을 불러오지 못했습니다.')}</Text>
            ) : coupons.length === 0 ? (
                showEmpty && <Card padding={4}><Text color="secondary">지금 받을 수 있는 쿠폰이 없습니다.</Text></Card>
            ) : (
                <div className={compact ? 'flex flex-col gap-space-sm' : 'grid gap-space-sm sm:grid-cols-2'}>
                    {coupons.map((c) => (
                        <DownloadableCard
                            key={c.couponId}
                            coupon={c}
                            inSellerPage={sellerId !== undefined}
                            loading={downloadingId === c.couponId}
                            busy={download.isPending}
                            loginHref={loginHref}
                            onDownload={() => c.couponId !== undefined && download.mutate({ couponId: c.couponId })}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

function DownloadableCard({
    coupon,
    inSellerPage,
    loading,
    busy,
    loginHref,
    onDownload,
}: {
    coupon: DownloadableCouponResponse;
    inSellerPage: boolean;
    loading: boolean;
    busy: boolean;
    loginHref?: string;
    onDownload: () => void;
}) {
    const soldOut = coupon.remaining === 0;
    const button = loginHref && !soldOut ? (
        <Button
            label="로그인하고 받기"
            size="sm"
            variant="primary"
            href={loginHref}
            as={Link}
            icon={<Icon name="login" className="text-[18px]" />}
        />
    ) : (
        <Button
            label={coupon.downloaded ? '받음' : soldOut ? '소진' : '받기'}
            size="sm"
            variant={coupon.downloaded || soldOut ? 'secondary' : 'primary'}
            icon={<Icon name={coupon.downloaded ? 'check' : 'download'} className="text-[18px]" />}
            isLoading={loading}
            isDisabled={coupon.downloaded || soldOut || (busy && !loading)}
            onClick={onDownload}
        />
    );
    return (
        <Card padding={4} className="flex items-center gap-space-md border-l-4 border-l-primary">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Text weight="semibold" className="text-primary text-lg">{discountLabel(coupon)}</Text>
                <Text weight="semibold" className="line-clamp-1">{coupon.name}</Text>
                <Text type="supporting" color="secondary">{conditionLabel(coupon, inSellerPage ? 'sellerPage' : 'buyer')}</Text>
                <Text type="supporting" color="secondary">
                    {usablePeriodLabel(coupon)}
                    {coupon.issueEndAt && ` · ${formatDateTime(coupon.issueEndAt)}까지 받기`}
                    {coupon.remaining != null && ` · 남은 수량 ${coupon.remaining.toLocaleString('ko-KR')}장`}
                </Text>
            </div>
            {button}
        </Card>
    );
}
