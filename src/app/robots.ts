import type { MetadataRoute } from 'next';
import { ROUTES } from '@/lib/routes';
import { absoluteUrl, siteUrl } from '@/lib/seo';

// 로그인 뒤 화면과 API, 검색어가 붙은 검색 URL은 크롤링하지 않는다. (OPS-4)
// 사이트 주소(SITE_URL)가 없으면 배포 주소가 정해지지 않은 환경으로 보고 전체를 막는다.
export default function robots(): MetadataRoute.Robots {
    if (!siteUrl()) {
        return { rules: { userAgent: '*', disallow: '/' } };
    }
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    `${ROUTES.search}?`,
                    ROUTES.myPage,
                    ROUTES.cart,
                    ROUTES.checkout,
                    ROUTES.groupPurchases,
                    ROUTES.inquiries,
                    ROUTES.otpSetup,
                    ROUTES.seller,
                    ROUTES.admin,
                ],
            },
        ],
        sitemap: absoluteUrl('/sitemap.xml') ?? undefined,
    };
}
