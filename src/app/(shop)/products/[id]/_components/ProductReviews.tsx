'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { errorMessage, http, type RsData } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';

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

// 상품 상세 아래 리뷰 섹션 (별점 요약을 누르면 #reviews로 온다)
export default function ProductReviews({ postId, reviewCount }: { postId: number; reviewCount: number }) {
    const query = useInfiniteQuery({
        queryKey: ['sales-post-reviews', postId],
        queryFn: ({ pageParam }) => fetchReviews(postId, pageParam),
        initialPageParam: 0,
        getNextPageParam: (last, _all, lastPageParam) =>
            last.totalPages != null && lastPageParam + 1 < last.totalPages ? lastPageParam + 1 : undefined,
    });

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
                            <ReviewItem key={review.reviewId} review={review} />
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

function ReviewItem({ review }: { review: Review }) {
    return (
        <li className="flex flex-col gap-space-sm p-5">
            <div className="flex flex-wrap items-center gap-space-sm">
                <Stars rating={review.rating} />
                <Text weight="semibold">{review.writerNickname}</Text>
                {review.isMine && <Badge label="내 리뷰" variant="blue" />}
                <Text type="supporting" color="secondary">
                    {formatDateTime(review.createdAt)}
                    {review.isEdited && ' · 수정됨'}
                </Text>
            </div>
            <Text type="supporting" color="secondary">
                {review.productName}
                {review.optionName && ` · ${review.optionName}`}
            </Text>
            <Text className="whitespace-pre-line">{review.content}</Text>

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

// 별 5개 중 rating개를 채운다 (1 ~ 5점)
function Stars({ rating }: { rating: number }) {
    return (
        <span className="inline-flex items-center" aria-label={`별점 ${rating}점`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Icon key={n} name="star" filled={n <= rating} className={`text-[18px] ${n <= rating ? 'text-amber-500' : 'text-outline-variant'}`} />
            ))}
        </span>
    );
}
