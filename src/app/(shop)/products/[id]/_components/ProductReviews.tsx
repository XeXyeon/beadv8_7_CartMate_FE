'use client';

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { getSelectSalesPostDetailQueryKey } from '@/api/generated/sales-post-controller/sales-post-controller';
import { errorMessage, http, type RsData } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';
import ReviewForm, { Stars } from '../../../_components/ReviewForm';

// GET /api/sales-posts/{postId}/reviews 응답. 생성 타입(orval)에 아직 없어 BE 응답(SalesPostReviewResponse)대로 적는다.
// 최신순 10개씩, 삭제된 리뷰는 빠진다. 로그인 없이 볼 수 있고, 로그인했으면 isMine이 내 리뷰를 알려 준다
type SellerReply = { content: string; repliedAt: string; isEdited: boolean };
type Review = {
    reviewId: number;
    writerNickname: string;
    productName: string;
    optionName: string | null;
    rating: number;
    content: string;
    isEdited: boolean;
    isMine: boolean;
    createdAt: string;
    sellerReply: SellerReply | null;
};
type ReviewPage = { content?: Review[]; page?: number; totalElements?: number; totalPages?: number };

function fetchReviews(postId: number, page: number): Promise<ReviewPage> {
    return http<RsData<ReviewPage>>(`/api/sales-posts/${postId}/reviews?page=${page}`).then((res) => res.data ?? {});
}

const reviewUrl = (reviewId: number) => `/api/sales-posts/reviews/${reviewId}`;

// 상품 상세 아래 리뷰 섹션 (별점 요약을 누르면 #reviews로 온다). 내 리뷰는 수정 · 삭제할 수 있다
export default function ProductReviews({ postId, reviewCount }: { postId: number; reviewCount: number }) {
    const queryClient = useQueryClient();
    const queryKey = ['sales-post-reviews', postId];
    const query = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam }) => fetchReviews(postId, pageParam),
        initialPageParam: 0,
        getNextPageParam: (last, _all, lastPageParam) =>
            last.totalPages != null && lastPageParam + 1 < last.totalPages ? lastPageParam + 1 : undefined,
    });

    // 수정 · 삭제 공통: 성공하면 리뷰 목록과 위쪽 별점 요약(판매글 상세)을 다시 받고, BE가 거절하면 이유를 alert로 보여 준다
    const change = useMutation({
        mutationFn: ({ url, init }: { url: string; init: RequestInit }) => http<unknown>(url, init),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey }),
                queryClient.invalidateQueries({ queryKey: getSelectSalesPostDetailQueryKey(postId) }),
            ]),
        onError: (error) => window.alert(errorMessage(error, '리뷰를 처리하지 못했습니다.')),
    });
    const run = (url: string, init: RequestInit) => change.mutateAsync({ url, init }).then(() => true, () => false);

    const editReview = (reviewId: number, rating: number, content: string) =>
        run(reviewUrl(reviewId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, content }),
        });
    const deleteReview = (reviewId: number) =>
        window.confirm('리뷰를 삭제할까요? 삭제한 리뷰는 되돌릴 수 없고, 이 상품에 다시 쓸 수 없습니다.')
            ? run(reviewUrl(reviewId), { method: 'DELETE' })
            : Promise.resolve(false);

    const reviews = query.data?.pages.flatMap((page) => page.content ?? []) ?? [];
    const total = query.data?.pages[0]?.totalElements ?? reviewCount;

    return (
        <section id="reviews" className="mt-10 flex w-full scroll-mt-24 flex-col gap-5 border-t border-outline-variant pt-10" aria-labelledby="product-reviews">
            <Heading id="product-reviews" level={2}>
                리뷰 {total > 0 && <span className="text-on-surface-variant">{total.toLocaleString('ko-KR')}</span>}
            </Heading>

            {query.isPending ? (
                <Text color="secondary">리뷰를 불러오는 중…</Text>
            ) : query.isError ? (
                <div className="flex items-center gap-space-sm" role="alert">
                    <Text className="text-error">{errorMessage(query.error, '리뷰를 불러오지 못했습니다.')}</Text>
                    <Button label="다시 시도" size="sm" variant="secondary" onClick={() => void query.refetch()} />
                </div>
            ) : reviews.length === 0 ? (
                <Text color="secondary">아직 리뷰가 없습니다. 구매를 확정한 구매자만 리뷰를 쓸 수 있습니다.</Text>
            ) : (
                <Card padding={0}>
                    <ul className="divide-y divide-outline-variant">
                        {reviews.map((review) => (
                            <ReviewItem
                                key={review.reviewId}
                                review={review}
                                busy={change.isPending}
                                onEdit={(rating, content) => editReview(review.reviewId, rating, content)}
                                onDelete={() => deleteReview(review.reviewId)}
                            />
                        ))}
                    </ul>
                </Card>
            )}

            {query.hasNextPage && (
                <div className="flex justify-center">
                    <Button
                        label={query.isFetchingNextPage ? '불러오는 중…' : '리뷰 더 보기'}
                        variant="secondary"
                        isDisabled={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                    />
                </div>
            )}
        </section>
    );
}

type ReviewItemProps = {
    review: Review;
    busy: boolean;
    onEdit: (rating: number, content: string) => Promise<boolean>;
    onDelete: () => Promise<boolean>;
};

function ReviewItem({ review, busy, onEdit, onDelete }: ReviewItemProps) {
    const [editing, setEditing] = useState(false);

    return (
        <li className="flex flex-col gap-space-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <div className="flex flex-wrap items-center gap-space-sm">
                    <Stars rating={review.rating} />
                    <Text weight="semibold">{review.writerNickname}</Text>
                    {review.isMine && <Badge label="내 리뷰" variant="blue" />}
                    <Text type="supporting" color="secondary">
                        {formatDateTime(review.createdAt)}
                        {review.isEdited && ' · 수정됨'}
                    </Text>
                </div>
                {/* 수정은 구매확정 후 30일 안만 된다. 기한이 지났으면 BE가 거절하고 그 이유를 alert로 보여 준다 */}
                {review.isMine && !editing && (
                    <div className="flex gap-space-xs">
                        <Button label="수정" size="sm" variant="ghost" isDisabled={busy} onClick={() => setEditing(true)} />
                        <Button label="삭제" size="sm" variant="ghost" isDisabled={busy} onClick={() => void onDelete()} />
                    </div>
                )}
            </div>
            <Text type="supporting" color="secondary">
                {review.productName}
                {review.optionName && ` · ${review.optionName}`}
            </Text>
            {editing ? (
                <ReviewForm
                    initialRating={review.rating}
                    initialContent={review.content}
                    submitLabel="수정 완료"
                    disabled={busy}
                    onSubmit={async (rating, content) => {
                        const ok = await onEdit(rating, content);
                        if (ok) setEditing(false);
                        return ok;
                    }}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <Text className="whitespace-pre-line">{review.content}</Text>
            )}

            {review.sellerReply && (
                <div className="mt-space-xs flex flex-col gap-1 rounded-lg bg-surface-container-low p-space-md">
                    <div className="flex items-center gap-space-xs">
                        <Icon name="subdirectory_arrow_right" className="text-[18px] text-on-surface-variant" />
                        <Text type="supporting" weight="semibold">판매자 답글</Text>
                        <Text type="supporting" color="secondary">
                            {formatDateTime(review.sellerReply.repliedAt)}
                            {review.sellerReply.isEdited && ' · 수정됨'}
                        </Text>
                    </div>
                    <Text type="supporting" className="whitespace-pre-line">{review.sellerReply.content}</Text>
                </div>
            )}
        </li>
    );
}
