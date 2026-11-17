'use client';

import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import ProductImage from '@/components/ui/ProductImage';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { SelectSalesPostResponse } from '@/api/generated/model';
import { useSelectSalesPostDetail, type selectSalesPostDetail } from '@/api/generated/sales-post-controller/sales-post-controller';
import { ApiError, errorMessage } from '@/api/http';
import { useToggleWish } from '@/api/wish';
import Icon from '@/components/ui/Icon';
import { useCurrentUser } from '@/lib/auth';
import { ROUTES } from '@/lib/routes';
import { findInventory, toProductOption, type ProductOption } from '@/lib/salesPost';
import { SellerTrustPanel, toSellerTrust } from '../../../_components/SellerTrust';
import ProductActions from './ProductActions';
import ProductOptions from './ProductOptions';
import ProductPaybackConditions from './ProductPaybackConditions';
import ProductComments from './ProductComments';
import ProductReviews from './ProductReviews';

// 판매글 응답의 리뷰 집계. 생성 타입(orval)에 아직 없어 BE 응답(SelectSalesPostResponse)에 맞춰 덧붙인다.
// reviewCount: 삭제된 리뷰를 뺀 리뷰 수, averageRating: 소수 첫째 자리 평균 별점(리뷰가 없으면 0)
type PostWithReviews = SelectSalesPostResponse & { reviewCount?: number; averageRating?: number };

type DetailResponse = Awaited<ReturnType<typeof selectSalesPostDetail>>;

// 상품 상세 = BE 판매글 상세(/api/sales-posts/detail). URL의 id 는 판매글 id 다.
// initialData: 서버(page.tsx)가 미리 받은 응답. 있으면 첫 HTML부터 본문이 들어간다(검색 엔진 · 공유 미리보기). (OPS-9)
export default function ProductDetail({ initialData }: { initialData?: DetailResponse }) {
    const { id } = useParams<{ id: string }>();
    const postId = Number(id);
    const validId = Number.isInteger(postId) && postId > 0;

    const query = useSelectSalesPostDetail(postId, { query: { enabled: validId, initialData } });
    const post = query.data?.data;

    if (!validId || (query.error instanceof ApiError && query.error.status === 404)) {
        return <NotFound />;
    }
    if (query.isPending) return <DetailSkeleton />;
    if (query.isError || !post) {
        return (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center" role="alert">
                <Text>{errorMessage(query.error, '상품 정보를 불러오지 못했습니다.')}</Text>
                <div className="mt-4"><Button label="다시 시도" onClick={() => query.refetch()} /></div>
            </div>
        );
    }

    // 다른 상품으로 이동하면 선택·수량 상태를 새로 시작하도록 판매글 id 를 key 로 준다.
    return <DetailContent key={post.id} post={post} />;
}

function DetailContent({ post }: { post: PostWithReviews }) {
    const [selectedId, setSelectedId] = useState<number | null>(null);
    // 고른 상품옵션: 옵션 종류(typeId) → 상품옵션(optionId). 상품을 바꾸면 비운다
    const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
    const [quantity, setQuantity] = useState(1);
    const [imageIndex, setImageIndex] = useState(0);

    const products = (post.productList ?? []).map(toProductOption).filter((p) => p !== null);
    const onSale = post.status === 'ON_SALE';
    // 처음에는 판매 중인 첫 상품을 고른 상태로 보여 준다. 고른 상품이 다시 불러온 뒤 판매 중지가 됐으면 첫 판매 중 상품으로 돌린다.
    const selectable = products.filter((p) => p.onSale);
    const currentId = selectable.find((p) => p.id === selectedId)?.id ?? selectable[0]?.id ?? null;
    const currentProduct = products.find((p) => p.id === currentId) ?? null;
    // 고른 상품 · 옵션 조합의 재고. 장바구니에는 이 inventoryId를 담는다
    const inventory = currentProduct ? findInventory(currentProduct, selectedOptions) : null;
    // 수량은 그 재고의 구매 가능 수량을 넘지 않게 (옵션을 바꿔 남은 수량이 줄어도 맞춘다)
    const shownQuantity = inventory ? Math.max(1, Math.min(quantity, inventory.available)) : 1;

    function selectProduct(productId: number) {
        setSelectedId(productId);
        setSelectedOptions({});
        setQuantity(1);
    }

    function selectOption(typeId: number, optionId: number | null) {
        setSelectedOptions((prev) => {
            const next = { ...prev };
            if (optionId == null) delete next[typeId];
            else next[typeId] = optionId;
            return next;
        });
        setQuantity(1);
    }
    // 찜: 비로그인이면 로그인 화면으로 보낸다. 401(로그인 만료)은 전역 처리가 로그인으로 보내므로 따로 표시하지 않는다
    const router = useRouter();
    const { isLoggedIn } = useCurrentUser();
    const toggleWish = useToggleWish();
    const canWish = post.status === 'ON_SALE' || post.status === 'PAUSED';
    const wishPendingId = toggleWish.isPending ? (toggleWish.variables?.productId ?? null) : null;
    const wishError =
        toggleWish.isError && !(toggleWish.error instanceof ApiError && toggleWish.error.status === 401)
            ? errorMessage(toggleWish.error, '찜하지 못했습니다.')
            : null;

    function handleToggleWish(product: ProductOption) {
        if (!isLoggedIn) {
            router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.product(post.id ?? 0))}`);
            return;
        }
        toggleWish.mutate({ productId: product.id, wished: !product.wished, salesPostId: post.id ?? 0 });
    }

    const images = products.flatMap((p) => p.imageUrls);
    const mainImage = images[Math.min(imageIndex, images.length - 1)];

    return (
        <div className="flex w-full flex-col">
            <div className="grid grid-cols-1 items-start gap-8 pb-12 lg:grid-cols-2">
                <div className="flex flex-col gap-space-md">
                    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-container-low">
                        <ProductImage src={mainImage} alt={post.title ?? ''} className="object-contain" iconClassName="text-[48px]" eager />
                    </div>
                    {images.length > 1 && (
                        <div className="grid grid-cols-4 gap-space-sm">
                            {images.map((url, i) => (
                                <button
                                    key={`${i}-${url}`}
                                    className={`relative aspect-square overflow-hidden rounded-md bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${i === imageIndex ? 'border-2 border-primary' : 'border border-outline-variant hover:border-outline'}`}
                                    type="button"
                                    aria-label={`이미지 ${i + 1}`}
                                    aria-pressed={i === imageIndex}
                                    onClick={() => setImageIndex(i)}
                                >
                                    <ProductImage src={url} alt="" className="object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <Badge label={onSale ? '판매 중' : '판매 중지'} variant={onSale ? 'blue' : 'neutral'} />
                        <Text type="supporting" color="secondary">조회 {post.viewCount ?? 0}</Text>
                    </div>
                    <Heading level={1}>{post.title}</Heading>
                    <RatingSummary count={post.reviewCount ?? 0} average={post.averageRating ?? 0} />
                    {products.length === 0 ? (
                        <Text color="secondary">등록된 상품이 없습니다.</Text>
                    ) : (
                        <ProductOptions
                            products={products}
                            selectedId={currentId}
                            selectedOptions={selectedOptions}
                            inventory={inventory}
                            quantity={shownQuantity}
                            disabled={!onSale}
                            onSelect={selectProduct}
                            onOptionChange={selectOption}
                            onQuantityChange={setQuantity}
                            canWish={canWish}
                            wishPendingId={wishPendingId}
                            wishError={wishError}
                            onToggleWish={handleToggleWish}
                        />
                    )}
                    <ProductActions
                        postId={post.id ?? 0}
                        inventoryId={inventory?.inventoryId ?? null}
                        available={inventory?.available ?? 0}
                        quantity={shownQuantity}
                        onSale={onSale}
                        total={inventory == null ? null : inventory.price * shownQuantity}
                    />
                    {currentId !== null && <ProductPaybackConditions key={currentId} productId={currentId} />}
                    <SellerTrustPanel sellerId={post.sellerId} fallback={toSellerTrust(post.sellerTrustLevel, post.sellerTrustScore)} />
                </div>
            </div>
            <section className="mt-6 flex w-full flex-col gap-5" aria-labelledby="product-information">
                <Heading id="product-information" level={2}>상품 상세 정보</Heading>
                {post.content && <Text className="whitespace-pre-line">{post.content}</Text>}
                {products.length > 0 && (
                    <Card padding={0}>
                    <div className="divide-y divide-outline-variant">
                        {products.map((product) => (
                            <div key={product.id} className="flex flex-col gap-1 p-5">
                                <Text weight="semibold">{product.name}</Text>
                                {product.description && (
                                    <Text type="supporting" color="secondary" className="whitespace-pre-line">{product.description}</Text>
                                )}
                            </div>
                        ))}
                    </div>
                    </Card>
                )}
            </section>
            {post.id != null && <ProductReviews postId={post.id} sellerId={post.sellerId} reviewCount={post.reviewCount ?? 0} />}
            {post.id != null && <ProductComments postId={post.id} sellerId={post.sellerId} />}
        </div>
    );
}

// 별점 요약: ★ 4.3 · 리뷰 12개. 누르면 아래 리뷰 목록(#reviews)으로 간다.
// 리뷰가 없으면 별 대신 안내만 보여 준다(0점으로 보이지 않게)
function RatingSummary({ count, average }: { count: number; average: number }) {
    if (count === 0) {
        return <Text type="supporting" color="secondary">아직 리뷰가 없습니다</Text>;
    }
    return (
        <a
            href="#reviews"
            className="flex w-fit items-center gap-space-xs rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={`평균 별점 ${average.toFixed(1)}점, 리뷰 ${count}개 보기`}
        >
            <Icon name="star" filled className="text-[20px] text-amber-500" />
            <Text weight="semibold">{average.toFixed(1)}</Text>
            <Text type="supporting" color="secondary">· 리뷰 {count.toLocaleString('ko-KR')}개</Text>
        </a>
    );
}

function NotFound() {
    return (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-8">
            <EmptyState title="상품을 찾을 수 없습니다" description="삭제되었거나 잘못된 주소일 수 있어요." icon={<Icon name="search_off" />} actions={<Button label="전체 상품 보기" href={ROUTES.search} as={Link} variant="primary" />} />
        </div>
    );
}

export function DetailSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-xl animate-pulse" aria-hidden>
            <div className="w-full aspect-square bg-surface-container-high" />
            <div className="flex flex-col gap-space-md">
                <div className="h-4 w-1/4 bg-surface-container-high rounded" />
                <div className="h-8 w-3/4 bg-surface-container-high rounded" />
                <div className="h-24 w-full bg-surface-container-high rounded" />
                <div className="h-11 w-full bg-surface-container-high rounded" />
            </div>
        </div>
    );
}
