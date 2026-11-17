import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import type { SelectSalesPostResponse } from '@/api/generated/model';
import { selectSalesPostAll } from '@/api/generated/sales-post-controller/sales-post-controller';
import { ROUTES } from '@/lib/routes';
import { NOINDEX_POST_STATUSES, siteUrl } from '@/lib/seo';

const PAGE_SIZE = 100;
// 한 sitemap 파일의 한도(5만 URL)보다 충분히 작게 끊는다. 넘으면 generateSitemaps로 나눈다.
const MAX_PAGES = 100;

// 공개 화면과 판매글 상세 목록. 판매글이 바뀌므로 빌드 때가 아니라 요청 때 만든다. (OPS-4)
// BE가 응답하지 않으면 판매글은 빼고 고정 경로만 낸다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    await connection();
    const base = siteUrl();
    if (!base) return [];
    const url = (path: string) => new URL(path, base).toString();

    const entries: MetadataRoute.Sitemap = [{ url: url(ROUTES.home) }, { url: url(ROUTES.search) }];
    for (const post of await loadPosts()) {
        if (post.id === undefined || (post.status && NOINDEX_POST_STATUSES.has(post.status))) continue;
        const updated = post.updatedAt ?? post.createdAt;
        entries.push({
            url: url(ROUTES.product(post.id)),
            ...(updated && { lastModified: new Date(updated) }),
        });
    }
    return entries;
}

async function loadPosts(): Promise<SelectSalesPostResponse[]> {
    const posts: SelectSalesPostResponse[] = [];
    try {
        for (let page = 0; page < MAX_PAGES; page++) {
            const data = (await selectSalesPostAll({ page, size: PAGE_SIZE })).data;
            posts.push(...(data?.content ?? []));
            if (!data?.totalPages || page + 1 >= data.totalPages) break;
        }
    } catch {
        // BE 오류: 그때까지 받은 판매글만 쓴다
    }
    return posts;
}
