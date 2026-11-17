import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import type { SelectSalesPostResponse } from '@/api/generated/model';
import { selectSalesPostDetail } from '@/api/generated/sales-post-controller/sales-post-controller';
import { ApiError } from '@/api/http';
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
    const prices = products.map((p) => p.price).filter((price): price is number => price !== null);
    const available = post.status === 'ON_SALE' && products.some((p) => p.onSale);
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
        });
    }

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdString({ '@context': 'https://schema.org', '@graph': graph }) }}
        />
    );
}

// 원단 스펙·사이즈 가이드·FAQ 탭은 상품별 데이터가 BE에 없어 숨겨 두었다. (로드맵 SHOP-3)
export default function ProductDetailPage({ params }: Props) {
    return (
        <div className="w-full">
            <Suspense>
                <ProductJsonLd params={params} />
            </Suspense>
            <div className="max-w-[1200px] mx-auto px-4 py-10 sm:px-6 sm:py-12">
                {/* 요청마다 달라지는 상품 id 를 읽는 부분만 클라이언트에서 렌더링되도록 Suspense로 감싼다 */}
                <Suspense fallback={<DetailSkeleton />}>
                    <ProductDetail />
                </Suspense>
            </div>
        </div>
    );
}
