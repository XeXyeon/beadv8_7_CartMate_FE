'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Text } from '@astryxdesign/core';
import type { PageResponseSelectSalesPostResponse, SelectSalesPostResponse } from '@/api/generated/model';
import { errorMessage, http, type RsData } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { useCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { formatPrice, toSalesPostCard } from '@/lib/salesPost';

const PAGE_SIZE = 10;

// GET /api/sales-posts/sellers/{sellerId}/posts 응답의 판매글 하나.
// 생성 타입(orval)에는 아직 updateStatus가 없어 BE 응답(SelectSalesPostResponse.updateStatus)에 맞춰 덧붙인다.
type SellerPost = SelectSalesPostResponse & { updateStatus?: string };
type SellerPostPage = Omit<PageResponseSelectSalesPostResponse, 'content'> & { content?: SellerPost[] };

// 판매자에게 보이는 판매 상태 (BE SalesPostSaleStatus 라벨과 같은 말)
const SALE_STATUS: Record<string, { label: string; variant: 'success' | 'error' | 'neutral' }> = {
    ON_SALE: { label: '판매 중', variant: 'success' },
    PAUSED: { label: '판매 중지', variant: 'neutral' },
    SUSPENDED: { label: '운영 중지', variant: 'error' },
    CLOSED: { label: '판매 종료', variant: 'neutral' },
    PENDING: { label: '등록 중', variant: 'neutral' },
    DELETING: { label: '삭제 중', variant: 'neutral' },
};

// 수정이 진행 중이거나 실패한 판매글만 따로 알린다 (BE SalesPostUpdateStatus)
const UPDATE_STATUS: Record<string, string> = {
    PENDING: '수정 중',
    RECOVERING: '복구 중',
    RECOVERY_FAILED: '복구 실패',
};

function fetchSellerPosts(sellerId: number, page: number): Promise<SellerPostPage | undefined> {
    return http<RsData<SellerPostPage>>(`/api/sales-posts/sellers/${sellerId}/posts?page=${page}&size=${PAGE_SIZE}`).then(
        (res) => res.data,
    );
}

// 판매자 본인의 판매글 목록 (삭제된 글만 빼고 모든 상태, 최신순)
export default function SellerPostList() {
    const { user, isLoading: userLoading } = useCurrentUser();
    const sellerId = user?.id;
    const [page, setPage] = useState(0);

    const list = useQuery({
        queryKey: ['seller-posts', sellerId, page],
        queryFn: () => fetchSellerPosts(sellerId as number, page),
        enabled: sellerId != null,
        staleTime: 0,
    });

    const posts = list.data?.content ?? [];
    const totalPages = list.data?.totalPages ?? 0;
    const loading = userLoading || (sellerId != null && list.isPending);

    return (
        <div className="flex flex-col gap-space-lg">
            <Card padding={0} className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant font-label-sm text-label-sm whitespace-nowrap">
                            <th className="py-space-md px-space-sm w-20 text-center">이미지</th>
                            {/* 좁은 화면에서도 판매글 칸은 최소 폭을, 가격 · 상태 · 등록일은 한 줄을 지킨다(넘치면 표가 가로로 스크롤) */}
                            <th className="py-space-md px-space-md min-w-64">판매글</th>
                            <th className="py-space-md px-space-md w-32 text-right">최저가</th>
                            <th className="py-space-md px-space-md w-32 text-center">상태</th>
                            <th className="py-space-md px-space-md w-36 text-center">등록일</th>
                            <th className="py-space-md px-space-md w-24 text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="font-body-sm text-body-sm divide-y divide-surface-container">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="py-space-xl text-center text-outline">불러오는 중…</td>
                            </tr>
                        ) : sellerId == null ? (
                            <tr>
                                <td colSpan={6} className="py-space-xl text-center text-error">판매자 정보를 확인할 수 없습니다. 다시 로그인해주세요.</td>
                            </tr>
                        ) : list.isError ? (
                            <tr>
                                <td colSpan={6} className="py-space-xl text-center text-error">
                                    {errorMessage(list.error, '판매글을 불러오지 못했습니다.')}
                                </td>
                            </tr>
                        ) : posts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-space-xl text-center text-outline">
                                    아직 등록한 판매글이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            posts.map((post) => <SellerPostRow key={post.id} post={post} />)
                        )}
                    </tbody>
                </table>
            </Card>

            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-space-xs" aria-label="페이지">
                    <button
                        type="button"
                        className="w-8 h-8 border border-outline-variant rounded disabled:opacity-40"
                        onClick={() => setPage((v) => Math.max(v - 1, 0))}
                        disabled={page === 0}
                        aria-label="이전 페이지"
                    >
                        <Icon name="chevron_left" className="text-[18px]" />
                    </button>
                    <span className="font-label-sm text-label-sm text-on-surface-variant px-space-sm">
                        {page + 1} / {totalPages}
                    </span>
                    <button
                        type="button"
                        className="w-8 h-8 border border-outline-variant rounded disabled:opacity-40"
                        onClick={() => setPage((v) => Math.min(v + 1, totalPages - 1))}
                        disabled={page >= totalPages - 1}
                        aria-label="다음 페이지"
                    >
                        <Icon name="chevron_right" className="text-[18px]" />
                    </button>
                </nav>
            )}
        </div>
    );
}

function SellerPostRow({ post }: { post: SellerPost }) {
    const card = toSalesPostCard(post);
    const sale = SALE_STATUS[post.status ?? ''] ?? { label: post.status ?? '-', variant: 'neutral' as const };
    const update = UPDATE_STATUS[post.updateStatus ?? ''];
    // 구매자에게 보이는 상태일 때만 상품 페이지로 연결한다
    const viewable = post.id != null && post.status !== 'PENDING' && post.status !== 'DELETING';

    return (
        <tr className="hover:bg-surface-container-low">
            <td className="py-space-sm px-space-sm">
                {card?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.imageUrl} alt="" className="w-12 h-12 object-cover rounded border border-outline-variant mx-auto" />
                ) : (
                    <div className="w-12 h-12 rounded bg-surface-container mx-auto flex items-center justify-center">
                        <Icon name="image" className="text-outline text-[18px]" />
                    </div>
                )}
            </td>
            <td className="py-space-sm px-space-md">
                <Text weight="semibold" display="block">{post.title}</Text>
                <div className="font-caption text-caption text-outline">
                    {card?.productName ?? '상품 없음'}
                    {(card?.productCount ?? 0) > 1 && ` 외 ${(card?.productCount ?? 1) - 1}개`} · 조회 {post.viewCount ?? 0}
                </div>
            </td>
            <td className="py-space-sm px-space-md text-right whitespace-nowrap">{card?.minPrice != null ? formatPrice(card.minPrice) : '-'}</td>
            <td className="py-space-sm px-space-md text-center">
                <div className="flex flex-col items-center gap-1 whitespace-nowrap">
                    <Badge label={sale.label} variant={sale.variant} />
                    {update && <Badge label={update} variant={post.updateStatus === 'RECOVERY_FAILED' ? 'error' : 'neutral'} />}
                </div>
            </td>
            <td className="py-space-sm px-space-md text-center text-outline whitespace-nowrap">{formatDateTime(post.createdAt)}</td>
            <td className="py-space-sm px-space-md text-center">
                {viewable ? (
                    <Button label="보기" href={ROUTES.product(post.id ?? 0)} as={Link} variant="secondary" size="sm" />
                ) : (
                    <span className="text-outline">-</span>
                )}
            </td>
        </tr>
    );
}
