import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import type { SelectSalesPostResponse } from '@/api/generated/model';
import { selectSalesPostDetail } from '@/api/generated/sales-post-controller/sales-post-controller';
import { ApiError, http, type RsData } from '@/api/http';
import { ROUTES } from '@/lib/routes';
import { toProductOption } from '@/lib/salesPost';
import { NOINDEX_POST_STATUSES, SITE_DESCRIPTION, SITE_NAME, jsonLdString, pageMetadata, siteUrl, summarize } from '@/lib/seo';
import ProductDetail, { DetailSkeleton } from './_components/ProductDetail';

type Props = { params: Promise<{ id: string }> };

// 메타데이터와 JSON-LD가 한 요청 안에서 판매글을 한 번만 불러오게 한다.
// 'not-found' = 없는 판매글, null = BE 오류 등으로 알 수 없음
const loadPost = cache(async (id: string): Promise<SelectSalesPostResponse | 'not-found' | null> => {
    const postId = Number(id);
    if (!Number.isInteger(postId) || postId <= 0) return 'not-found';
    try {
        return (await selectSalesPostDetail(postId)).data ?? 'not-found';
    } catch (error) {
        return error instanceof ApiError && error.status === 404 ? 'not-found' : null;
    }
});

// 판매글 응답의 리뷰 집계(생성 타입에 아직 없음). 화면 별점 요약(ProductDetail의 RatingSummary)과 같은 값이다
type PostWithReviews = SelectSalesPostResponse & { reviewCount?: number; averageRating?: number };

// 화면 리뷰 목록의 첫 페이지(최신 10개, 로그인 없이 보임)와 같은 값만 구조화 데이터에 쓴다
type PublicReview = { writerNickname?: string; rating?: number; content?: string; createdAt?: string };
const loadReviews = cache(async (postId: number): Promise<PublicReview[]> => {
    try {
        const res = await http<RsData<{ content?: PublicReview[] }>>(`/api/sales-posts/${postId}/reviews?page=0`);
        return res.data?.content ?? [];
    } catch {
        return [];
    }
});

const productsOf = (post: SelectSalesPostResponse) =>
    (post.productList ?? []).map(toProductOption).filter((p) => p !== null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    const post = await loadPost(id);
    const path = ROUTES.product(id);

    if (post === 'not-found') {
        return { title: `상품을 찾을 수 없습니다 | ${SITE_NAME}`, robots: { index: false, follow: true } };
    }
    if (!post) {
        return pageMetadata({ title: `상품 상세 | ${SITE_NAME}`, description: SITE_DESCRIPTION, path });
    }

    const products = productsOf(post);
    const image = products.flatMap((p) => p.imageUrls)[0];
    const metadata = pageMetadata({
        title: `${post.title ?? '상품 상세'} | ${SITE_NAME}`,
        description:
            summarize(post.content) ?? summarize(products.map((p) => p.name).join(', ')) ?? SITE_DESCRIPTION,
        path,
        images: image ? [image] : undefined,
    });
    return post.status && NOINDEX_POST_STATUSES.has(post.status)
        ? { ...metadata, robots: { index: false, follow: true } }
        : metadata;
}

// 상품 · 경로 구조화 데이터. 본문은 클라이언트에서 그리지만 이 블록은 서버 HTML에 들어간다.
async function ProductJsonLd({ params }: Props) {
    const { id } = await params;
    const post = await loadPost(id);
    const base = siteUrl();
    if (!post || post === 'not-found' || !base) return null;

    const url = new URL(ROUTES.product(id), base).toString();
    const name = post.title ?? '상품';
    const products = productsOf(post);
    // 실제 판매가는 재고(옵션 조합)별 가격(기본가 + 추가 금액)이다. 재고 정보가 없는 상품만 기본가를 쓴다
    const prices = products.flatMap((p) =>
        p.inventories.length > 0 ? p.inventories.map((i) => i.price) : p.price !== null ? [p.price] : [],
    );
    // 판매 중인 상품에 지금 살 수 있는 재고가 하나라도 있어야 InStock
    const available =
        post.status === 'ON_SALE' && products.some((p) => p.onSale && p.inventories.some((i) => i.available > 0));
    const availability = `https://schema.org/${available ? 'InStock' : 'OutOfStock'}`;
    const low = Math.min(...prices);
    const high = Math.max(...prices);

    const graph: object[] = [
        {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '홈', item: new URL(ROUTES.home, base).toString() },
                { '@type': 'ListItem', position: 2, name: '전체 상품', item: new URL(ROUTES.search, base).toString() },
                { '@type': 'ListItem', position: 3, name, item: url },
            ],
        },
    ];
    // Google의 Product 결과는 가격(offers)이 있어야 한다. 가격이 없으면 경로만 낸다.
    if (prices.length > 0) {
        const { reviewCount = 0, averageRating = 0 } = post as PostWithReviews;
        const reviews = reviewCount > 0 && post.id != null ? await loadReviews(post.id) : [];
        graph.push({
            '@type': 'Product',
            name,
            url,
            description: summarize(post.content, 500),
            image: products.flatMap((p) => p.imageUrls).map((src) => new URL(src, base).toString()),
            offers:
                low === high
                    ? { '@type': 'Offer', url, price: low, priceCurrency: 'KRW', availability }
                    : {
                          '@type': 'AggregateOffer',
                          url,
                          lowPrice: low,
                          highPrice: high,
                          offerCount: prices.length,
                          priceCurrency: 'KRW',
                          availability,
                      },
            ...(reviewCount > 0 && {
                aggregateRating: { '@type': 'AggregateRating', ratingValue: averageRating, reviewCount, bestRating: 5, worstRating: 1 },
            }),
            ...(reviews.length > 0 && {
                review: reviews
                    .filter((r) => r.rating != null)
                    .map((r) => ({
                        '@type': 'Review',
                        author: { '@type': 'Person', name: r.writerNickname || '구매자' },
                        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
                        ...(r.createdAt && { datePublished: r.createdAt.slice(0, 10) }),
                        ...(summarize(r.content, 500) && { reviewBody: summarize(r.content, 500) }),
                    })),
            }),
        });
    }

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdString({ '@context': 'https://schema.org', '@graph': graph }) }}
        />
    );
}

// 판매글을 서버에서 받아 상세 화면의 첫 데이터로 넘긴다. 첫 HTML에 제목 · 본문 · 이미지 · 가격이 들어간다. (OPS-9)
// 없는 판매글 · BE 오류면 넘기지 않고 지금처럼 브라우저에서 불러와 안내 화면을 보여 준다.
async function ServerProductDetail({ params }: Props) {
    const { id } = await params;
    const post = await loadPost(id);
    return <ProductDetail initialData={post && post !== 'not-found' ? { data: post } : undefined} />;
}

// 원단 스펙·사이즈 가이드·FAQ 탭은 상품별 데이터가 BE에 없어 숨겨 두었다. (로드맵 SHOP-3)
export default function ProductDetailPage({ params }: Props) {
    return (
        <div className="w-full">
            <Suspense>
                <ProductJsonLd params={params} />
            </Suspense>
            <div className="max-w-[1200px] mx-auto px-4 py-10 sm:px-6 sm:py-12">
                {/* 요청마다 달라지는 상품 id 를 읽고 판매글을 받는 부분만 Suspense로 감싸 요청 때 채운다 */}
                <Suspense fallback={<DetailSkeleton />}>
                    <ServerProductDetail params={params} />
                </Suspense>
            </div>
        </div>
    );
}
