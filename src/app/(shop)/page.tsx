import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { selectSalesPostAll } from '@/api/generated/sales-post-controller/sales-post-controller';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, jsonLdString, pageMetadata, siteUrl } from '@/lib/seo';
import HomeSalesPosts, { HOME_PAGE_SIZE } from './_components/HomeSalesPosts';

export const metadata: Metadata = pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: ROUTES.home });

// 사이트 · 운영 주체 구조화 데이터. 절대 URL이 필요해 사이트 주소가 있을 때만 낸다.
function SiteJsonLd() {
    const base = siteUrl();
    if (!base) return null;
    const url = new URL(ROUTES.home, base).toString();
    const data = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebSite', name: SITE_NAME, url, inLanguage: 'ko-KR' },
            { '@type': 'Organization', name: SITE_NAME, url },
        ],
    };
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}

const PURCHASE_STEPS = [
    { icon: 'search', title: '상품 찾기', description: '팀에 필요한 유니폼과 장비를 살펴보세요.' },
    { icon: 'group_add', title: '공동구매 만들기', description: '상품과 모집 조건을 정해 팀원에게 공유하세요.' },
    { icon: 'check_circle', title: '함께 주문하기', description: '각자 옵션과 수량을 선택해 주문에 참여하세요.' },
];

export default function HomePage() {
    return (
        <div className="w-full">
            <SiteJsonLd />
            <section className="bg-surface-container-low">
                <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:py-16">
                    {/* astryx Text·Heading 은 자체 margin 이 우선해 mt-* 가 먹지 않는다. 간격은 부모 gap 으로 준다. */}
                    <div className="flex max-w-2xl flex-col items-start gap-4">
                        <Heading level={1} type="display-2" textWrap="balance">
                            팀 장비 구매를 한곳에서,
                            <br />함께 사면 더 간단하게
                        </Heading>
                        <Text type="large" color="secondary" className="max-w-xl">
                            판매 상품을 비교하고 공동구매를 만들어 팀원별 주문을 한 번에 모아보세요.
                        </Text>
                        <div className="mt-3 flex flex-wrap gap-3">
                            <Button label="상품 둘러보기" href={ROUTES.search} variant="primary" size="lg" />
                            <Button label="공동구매 시작하기" href={ROUTES.groupPurchaseNew} variant="secondary" size="lg" />
                        </div>
                    </div>
                </div>
            </section>

            <div className="mx-auto flex max-w-[1200px] flex-col gap-16 px-4 py-12 sm:px-6">
                <Suspense fallback={<HomeSalesPosts />}>
                    <ServerHomeSalesPosts />
                </Suspense>
                <section aria-labelledby="purchase-guide" className="pt-4">
                    <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <Heading id="purchase-guide" level={2}>공동구매는 이렇게 시작해요</Heading>
                        <Button label="예치금 이용 안내" href={ROUTES.deposit} variant="ghost" size="sm" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        {PURCHASE_STEPS.map((step, index) => (
                            <Card key={step.title} padding={5}>
                                <div className="mb-5 flex items-center justify-between">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-primary">
                                        <Icon name={step.icon} className="text-[22px]" />
                                    </span>
                                    <Text type="supporting" color="secondary">0{index + 1}</Text>
                                </div>
                                <Heading level={3}>{step.title}</Heading>
                                <Text display="block" color="secondary" className="mt-2">{step.description}</Text>
                            </Card>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

// 최신 판매 상품 첫 페이지를 서버에서 받아 넘긴다. 첫 HTML에 상품 카드 · 상세 링크가 들어가 검색 엔진이 따라갈 수 있다. (OPS-9)
// BE가 응답하지 않으면 지금처럼 브라우저에서 불러온다.
async function ServerHomeSalesPosts() {
    const initialData = await selectSalesPostAll({ page: 0, size: HOME_PAGE_SIZE }).catch(() => undefined);
    return <HomeSalesPosts initialData={initialData} />;
}
