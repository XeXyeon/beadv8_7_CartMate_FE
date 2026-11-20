'use client';

import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { useGetDownloadableCoupons } from '@/api/generated/coupon-controller/coupon-controller';
import DownloadableCoupons from '@/components/coupon/DownloadableCoupons';
import { useCurrentUser } from '@/lib/auth';

// 상품 상세의 쿠폰 받기: 전체 쿠폰 + 이 판매자 쿠폰(CPN-1 확정).
// 비로그인으로는 받기 목록을 부를 수 없어(BE 500, BE:ISS-44) 그리지 않고, 받을 쿠폰이 없을 때도 칸을 그리지 않는다.
export default function ProductCoupons({ sellerId }: { sellerId: number | undefined }) {
    const { isLoggedIn } = useCurrentUser();
    if (!isLoggedIn || sellerId === undefined) return null;
    return <ProductCouponsCard sellerId={sellerId} />;
}

function ProductCouponsCard({ sellerId }: { sellerId: number }) {
    // DownloadableCoupons와 같은 키라 요청은 한 번만 나간다
    const query = useGetDownloadableCoupons({ sellerId }, { query: { staleTime: 0 } });
    // 받을 쿠폰을 한 번 받아 온 뒤에만 칸을 그린다(로딩 · 조회 오류 · 빈 목록은 그리지 않음).
    // 한 번 그린 뒤에는 마지막 쿠폰이 소진돼 목록이 비어도 받기 오류 문구가 보이도록 칸을 남긴다.
    const [shown, setShown] = useState(false);
    const hasCoupons = query.isSuccess && (query.data?.data ?? []).length > 0;
    if (hasCoupons && !shown) setShown(true);
    if (!hasCoupons && !shown) return null;
    return (
        <section aria-labelledby="product-coupons">
            <Card variant="muted" className="flex flex-col gap-3">
                <Heading id="product-coupons" level={2}>쿠폰 받기</Heading>
                <DownloadableCoupons sellerId={sellerId} compact />
            </Card>
        </section>
    );
}
