'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Text } from '@astryxdesign/core/Text';
import { getSelectSalesPostDetailQueryKey } from '@/api/generated/sales-post-controller/sales-post-controller';
import { errorMessage, http, type RsData } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import ReviewForm from '../../../_components/ReviewForm';

// GET /api/sales-posts/reviews/writable 응답. 생성 타입(orval)에 아직 없어 BE 응답(WritableSalesPostReviewResponse)대로 적는다.
// 구매확정했고, 기한(구매확정 후 30일)이 남았고, 아직 리뷰를 안 쓴 구매 기록. 기한이 가까운 순
type WritableReview = {
    purchaseId: number;
    salesPostId: number;
    productName: string;
    optionName: string | null;
    confirmedAt: string;
    writableUntil: string;
};

const WRITABLE_KEY = ['writable-reviews'];

function fetchWritable(): Promise<WritableReview[]> {
    return http<RsData<WritableReview[]>>('/api/sales-posts/reviews/writable').then((res) => res.data ?? []);
}

// 마이페이지 리뷰 쓰기: 쓸 수 있는 상품 목록 → 하나를 펼쳐 별점 · 내용을 쓰면 목록에서 빠진다
export default function WritableReviewList() {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: WRITABLE_KEY, queryFn: fetchWritable });
    const [openId, setOpenId] = useState<number | null>(null);
    const [doneMessage, setDoneMessage] = useState<string | null>(null);

    const create = useMutation({
        mutationFn: (body: { purchaseId: number; rating: number; content: string }) =>
            http<unknown>('/api/sales-posts/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }),
        onError: (error) => window.alert(errorMessage(error, '리뷰를 쓰지 못했습니다.')),
    });

    async function write(item: WritableReview, rating: number, content: string): Promise<boolean> {
        try {
            await create.mutateAsync({ purchaseId: item.purchaseId, rating, content });
        } catch {
            return false;
        }
        setOpenId(null);
        setDoneMessage(`${item.productName} 리뷰를 등록했습니다.`);
        // 쓴 상품은 목록에서 빠지고, 그 판매글의 리뷰 목록 · 별점 요약도 새로 받는다
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: WRITABLE_KEY }),
            queryClient.invalidateQueries({ queryKey: ['sales-post-reviews', item.salesPostId] }),
            queryClient.invalidateQueries({ queryKey: getSelectSalesPostDetailQueryKey(item.salesPostId) }),
        ]);
        return true;
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
                title="리뷰 쓸 상품을 불러오지 못했습니다"
                description={errorMessage(query.error, '잠시 후 다시 시도해주세요.')}
                actions={<Button label="다시 시도" variant="secondary" onClick={() => void query.refetch()} />}
            />
        );
    }

    const items = query.data;

    return (
        <div className="flex flex-col gap-space-md">
            {doneMessage && (
                <div className="flex items-center gap-2" role="status">
                    <Icon name="check_circle" className="text-[18px] text-primary" />
                    <Text type="supporting">{doneMessage}</Text>
                </div>
            )}

            {items.length === 0 ? (
                <EmptyState
                    title="리뷰를 쓸 수 있는 상품이 없습니다"
                    description="배송을 받고 구매를 확정하면 30일 안에 리뷰를 쓸 수 있습니다."
                    actions={<Button label="배송 조회" variant="secondary" href={ROUTES.deliveries} />}
                />
            ) : (
                <>
                    <Text type="supporting" color="secondary">총 {items.length}건 · 기한이 가까운 순</Text>
                    <div className="flex flex-col gap-space-sm">
                        {items.map((item) => (
                            <Card key={item.purchaseId} padding={4}>
                                <div className="flex flex-col gap-space-sm">
                                    <div className="flex flex-wrap items-start justify-between gap-space-sm">
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <Link className="font-body-lg text-body-lg font-semibold text-on-surface hover:text-primary hover:underline" href={ROUTES.product(item.salesPostId)}>
                                                {item.productName}
                                            </Link>
                                            {item.optionName && <Text type="supporting" color="secondary">{item.optionName}</Text>}
                                            <Text type="supporting" color="secondary">
                                                구매확정 {formatDateTime(item.confirmedAt)} · {formatDateTime(item.writableUntil)}까지 작성 가능
                                            </Text>
                                        </div>
                                        {openId !== item.purchaseId && (
                                            <Button
                                                label="리뷰 쓰기"
                                                size="sm"
                                                icon={<Icon name="rate_review" />}
                                                onClick={() => {
                                                    setOpenId(item.purchaseId);
                                                    setDoneMessage(null);
                                                }}
                                            />
                                        )}
                                    </div>
                                    {openId === item.purchaseId && (
                                        <div className="pt-space-xs">
                                            <ReviewForm
                                                submitLabel="리뷰 등록"
                                                disabled={create.isPending}
                                                onSubmit={(rating, content) => write(item, rating, content)}
                                                onCancel={() => setOpenId(null)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
