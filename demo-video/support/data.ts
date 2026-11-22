import type { APIRequestContext, Browser } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { WORK_DIR } from './narrate';

// 시연용 판매글 · 상품 이미지. 판매글은 API로 준비하고(E2E의 createPost와 같은 요청), 제목에 runId를 붙이지 않아 화면이 깨끗하다.

export type DemoPost = { postId: number; title: string; productName: string; inventoryId: number; price: number };

/** 상품 이미지(800x800 PNG): 색 바탕 + 큰 이모지 + 이름. 브라우저로 그려서 얻는다. */
export async function productImage(browser: Browser, emoji: string, label: string, color: string): Promise<Buffer> {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 800 } });
    const page = await ctx.newPage();
    await page.setContent(
        `<body style="margin:0;width:800px;height:800px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,${color},#ffffff);font-family:-apple-system,'Apple SD Gothic Neo',sans-serif">
        <div style="font-size:340px;line-height:1">${emoji}</div><div style="margin-top:36px;font-size:56px;font-weight:700;color:#1f2937">${label}</div></body>`,
    );
    const png = await page.screenshot({ type: 'png' });
    await ctx.close();
    return png;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function json(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<Json> {
    if (!res.ok()) throw new Error(`${what} 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as Json;
    return (body?.data ?? body) as Json;
}

export async function createDemoPost(seller: APIRequestContext, opts: { title: string; name: string; price: number; stock?: number; image: Buffer; content?: string }): Promise<DemoPost> {
    const info = await json(await seller.get('/api/members/me/seller'), '판매자 정보 조회');
    const sellerId = Number(info.id ?? info.sellerId);
    const res = await seller.post('/api/sales-posts', {
        multipart: {
            request: {
                name: 'request',
                mimeType: 'application/json',
                buffer: Buffer.from(
                    JSON.stringify({
                        sellerId,
                        title: opts.title,
                        content: opts.content ?? `${opts.name} 판매글입니다.`,
                        productList: [
                            {
                                categoryId: 1,
                                name: opts.name,
                                description: `${opts.name} 상세 설명`,
                                basePrice: opts.price,
                                productImageList: [{ imageSeq: 1 }],
                                inventoryList: [{ optionList: [], additionalPrice: 0, stockQuantity: opts.stock ?? 50 }],
                            },
                        ],
                    }),
                ),
            },
            images: { name: 'img.png', mimeType: 'image/png', buffer: opts.image },
        },
    });
    if (!res.ok()) throw new Error(`판매글 등록 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
    const list = await json(await seller.get(`/api/sales-posts/sellers/${sellerId}/posts?page=0&size=50`), '내 판매글 목록');
    const post = (list.content ?? []).find((p: Json) => p.title === opts.title);
    if (!post) throw new Error(`방금 등록한 판매글(${opts.title})을 찾지 못했습니다.`);
    const postId = Number(post.postId ?? post.id);
    const detail = await json(await seller.get(`/api/sales-posts/detail/${postId}`), '판매글 상세');
    const inv = detail.productList?.[0]?.inventoryList?.[0];
    const inventoryId = Number(inv?.inventoryId ?? inv?.id);
    if (!inventoryId) throw new Error('재고 id를 찾지 못했습니다.');
    return { postId, title: opts.title, productName: opts.name, inventoryId, price: opts.price };
}

/** 인증 코드가 필요한 장면에서 로그에 찍힌 개수를 세지 않도록, 도커가 떠 있는지만 확인한다. */
export function assertDocker() {
    execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', 'cartmate-e2e-member-service-1'], { stdio: 'pipe' });
}
export const imgPath = (name: string) => path.join(WORK_DIR, name);
