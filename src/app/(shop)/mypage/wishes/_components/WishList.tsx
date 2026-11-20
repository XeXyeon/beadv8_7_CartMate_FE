'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Text } from '@astryxdesign/core/Text';
import { ApiError, errorMessage } from '@/api/http';
import { useMyWishes, useToggleWish, type Wish, type WishDisplayStatus } from '@/api/wish';
import Icon from '@/components/ui/Icon';
import ProductImage from '@/components/ui/ProductImage';
import { formatDateTime } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { formatPrice, imageUrl } from '@/lib/salesPost';

const STATUS_BADGE: Record<WishDisplayStatus, { label: string; variant: 'blue' | 'neutral' | 'red' }> = {
    ON_SALE: { label: '판매 중', variant: 'blue' },
    PAUSED: { label: '판매 중지', variant: 'neutral' },
    CLOSED: { label: '판매 종료', variant: 'neutral' },
    UNAVAILABLE: { label: '볼 수 없는 상품', variant: 'red' },
};

// 마이페이지 찜한 상품: 최근 찜 먼저, 한 페이지에 20개. 줄마다 찜 해제할 수 있다.
// 볼 수 없는 상품(운영 중지)은 상품명 · 이미지 · 가격 없이 찜 해제만 보여 준다
export default function WishList() {
    const [page, setPage] = useState(0);
    const query = useMyWishes(page);
    const toggleWish = useToggleWish();
    const removingId = toggleWish.isPending ? (toggleWish.variables?.productId ?? null) : null;
    const showError = toggleWish.isError && !(toggleWish.error instanceof ApiError && toggleWish.error.status === 401);

    // 이 페이지의 마지막 찜을 해제해 페이지가 비면 앞 페이지로 간다
    function unwish(item: Wish) {
        const lastOnPage = query.data?.content.length === 1;
        toggleWish.mutate(
            { productId: item.productId, wished: false, salesPostId: item.salesPostId },
            { onSuccess: () => { if (lastOnPage) setPage((p) => Math.max(0, p - 1)); } },
        );
    }

    if (query.isPending) {
        return (
            <div className="flex flex-col gap-space-sm" aria-hidden>
                {[0, 1, 2].map((n) => (
                    <div key={n} className="h-24 rounded bg-surface-container animate-pulse" />
                ))}
            </div>
        );
    }

    if (query.isError) {
        return (
            <EmptyState
                title="찜한 상품을 불러오지 못했습니다"
                description={errorMessage(query.error, '잠시 후 다시 시도해주세요.')}
                actions={<Button label="다시 시도" variant="secondary" onClick={() => void query.refetch()} />}
            />
        );
    }

    const { content: items, totalElements, totalPages } = query.data;

    if (totalElements === 0) {
        return (
            <EmptyState
                title="찜한 상품이 없습니다"
                description="상품 상세에서 하트를 누르면 여기에 모아 볼 수 있습니다."
                actions={<Button label="전체 상품 보기" variant="secondary" href={ROUTES.search} as={Link} />}
            />
        );
    }

    return (
        <div className="flex flex-col gap-space-md">
            <Text type="supporting" color="secondary">총 {totalElements.toLocaleString('ko-KR')}개 · 최근에 찜한 순</Text>
            {showError && (
                <p className="font-body-sm text-body-sm text-error" role="alert">
                    {errorMessage(toggleWish.error, '찜을 해제하지 못했습니다.')}
                </p>
            )}
            <div className="flex flex-col gap-space-sm">
                {items.map((item) => (
                    <WishRow key={item.productId} item={item} removing={removingId === item.productId} onUnwish={() => unwish(item)} />
                ))}
            </div>
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-space-md font-label-sm text-label-sm">
                    <button
                        className="h-8 w-8 border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-40"
                        type="button"
                        aria-label="이전 페이지"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                        <Icon name="chevron_left" className="text-[18px]" />
                    </button>
                    <span className="text-on-surface-variant">
                        {page + 1} / {totalPages}
                    </span>
                    <button
                        className="h-8 w-8 border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-40"
                        type="button"
                        aria-label="다음 페이지"
                        disabled={page + 1 >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        <Icon name="chevron_right" className="text-[18px]" />
                    </button>
                </div>
            )}
        </div>
    );
}

function WishRow({ item, removing, onUnwish }: { item: Wish; removing: boolean; onUnwish: () => void }) {
    const badge = STATUS_BADGE[item.displayStatus];
    const hidden = item.displayStatus === 'UNAVAILABLE';
    const name = hidden ? '볼 수 없는 상품입니다' : (item.productName ?? '');

    return (
        <Card padding={4}>
            <div className="flex items-center gap-space-md">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-surface-container-low flex items-center justify-center">
                    <ProductImage src={hidden ? null : imageUrl(item.thumbnailS3Key ?? undefined)} alt={name} className="object-cover" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div>
                        <Badge label={badge.label} variant={badge.variant} />
                    </div>
                    {hidden ? (
                        <Text color="secondary">{name}</Text>
                    ) : (
                        <Link className="line-clamp-1 font-semibold hover:text-primary hover:underline" href={ROUTES.product(item.salesPostId)}>
                            {name}
                        </Link>
                    )}
                    {!hidden && item.basePrice != null && <Text weight="semibold">{formatPrice(item.basePrice)}</Text>}
                    <Text type="supporting" color="secondary">찜한 날 {formatDateTime(item.wishedAt)}</Text>
                </div>
                <Button
                    label="찜 해제"
                    size="sm"
                    variant="secondary"
                    icon={<Icon name="heart_minus" />}
                    isLoading={removing}
                    onClick={onUnwish}
                />
            </div>
        </Card>
    );
}
