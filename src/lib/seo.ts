import type { Metadata } from 'next';

// 공개 화면 SEO 공통 값. (로드맵 OPS-4)
export const SITE_NAME = 'TEAMBUY';
export const SITE_TITLE = 'TEAMBUY - 팀 스포츠 단체복 · 장비 공동구매';
export const SITE_DESCRIPTION =
    '팀 유니폼 · 단체복과 스포츠 장비를 비교하고, 공동구매를 만들어 팀원별 옵션과 수량 주문을 한 번에 모으는 팀 스포츠 공동구매 플랫폼입니다.';

// 배포 주소(예: https://teambuy.example). canonical · OG · sitemap의 절대 URL에 쓴다.
// 값이 없으면 주소를 지어내지 않고 null을 돌려준다. 이때 robots.txt는 전체 색인을 막는다(app/robots.ts).
// 주의: 정적으로 미리 렌더링되는 화면은 `next build` 때 값을 읽으므로 빌드 단계에도 같은 값을 줘야 한다.
export function siteUrl(): URL | null {
    const raw = process.env.SITE_URL?.trim();
    if (!raw) return null;
    try {
        return new URL(raw);
    } catch {
        return null;
    }
}

export function absoluteUrl(path: string): string | null {
    const base = siteUrl();
    return base ? new URL(path, base).toString() : null;
}

// 검색 결과에 남기지 않을 판매글 상태 (상품 상세 noindex · sitemap 제외)
export const NOINDEX_POST_STATUSES: ReadonlySet<string> = new Set(['DELETED', 'SUSPENDED', 'PENDING']);

const DEFAULT_OG_IMAGE = '/opengraph-image';

const BASE_OPEN_GRAPH = { type: 'website', siteName: SITE_NAME, locale: 'ko_KR' } as const;

// 화면별 메타데이터. 자식 segment의 openGraph는 부모 것을 통째로 덮어쓰므로 공통 OG 값을 여기서 다시 합친다.
export function pageMetadata({
    title,
    description,
    path,
    images,
}: {
    title: string;
    description: string;
    path: string;
    images?: string[];
}): Metadata {
    const hasBase = siteUrl() !== null;
    // 상대 경로 이미지는 metadataBase가 있어야 절대 URL이 된다. 주소가 없으면 뺀다.
    images = images?.filter((src) => hasBase || /^https?:\/\//.test(src));
    // 이미지가 없으면 사이트 기본 공유 이미지(app/opengraph-image.tsx). 자식의 openGraph가 루트 이미지를 덮어써 빠지므로 직접 넣는다.
    if (!images?.length && hasBase) images = [DEFAULT_OG_IMAGE];
    return {
        title,
        description,
        ...(hasBase && { alternates: { canonical: path } }),
        openGraph: {
            ...BASE_OPEN_GRAPH,
            title,
            description,
            ...(hasBase && { url: path }),
            ...(images?.length && { images }),
        },
        twitter: { card: 'summary_large_image', title, description, ...(images?.length && { images }) },
    };
}

export const rootOpenGraph = { ...BASE_OPEN_GRAPH, title: SITE_TITLE, description: SITE_DESCRIPTION };

// <script type="application/ld+json">에 넣을 문자열. 데이터에 섞인 '<'가 스크립트를 닫지 못하게 바꾼다.
export function jsonLdString(data: unknown): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

// 판매글 본문을 description 길이(대략 150자)로 줄인다.
export function summarize(text: string | undefined, max = 150): string | undefined {
    const plain = text?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!plain) return undefined;
    return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
