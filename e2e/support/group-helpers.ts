import { expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import { authFile, type AccountKey } from './auth';
import { withRunId } from './run';

// 공동구매(N빵 · 개인물품 공구) 흐름 공용 도우미. 판매글 같은 "준비물"은 API로 만들고, 검증하려는 화면은 UI로 돈다.
// 사람마다 브라우저 컨텍스트를 따로 쓴다(사람 = 계정). 컨텍스트는 저장된 로그인 상태(storageState)만 읽고 다시 저장하지 않는다.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
export const parseWon = (text: string) => Number(text.replace(/[^\d]/g, ''));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function json<T = Json>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
    if (!res.ok()) throw new Error(`${what} 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as Json;
    return (body?.data ?? body) as T;
}

export type Person = { key: AccountKey; context: BrowserContext; page: Page };

/** 계정 한 명의 브라우저 컨텍스트 + 첫 페이지. confirm · alert 창은 자동으로 수락한다. */
export async function openPerson(browser: Browser, baseURL: string | undefined, key: AccountKey): Promise<Person> {
    const context = await browser.newContext({ baseURL, storageState: authFile(key) });
    const page = await context.newPage();
    page.on('dialog', (d) => void d.accept());
    return { key, context, page };
}

export async function closePeople(...people: Array<Person | undefined>) {
    for (const p of people) await p?.context.close().catch(() => {});
}

export async function walletBalance(request: APIRequestContext): Promise<number> {
    const w = await json(await request.get('/api/wallets/me'), '예치금 조회');
    return Number(w.balance);
}

/** 잔액이 모자라면 DB로 채우지 않고 이유를 적어 멈춘다(보충은 공통 setup의 일). */
export async function requireBalance(person: Person, min: number): Promise<number> {
    const balance = await walletBalance(person.context.request);
    if (balance < min) {
        throw new Error(`${person.key}: 예치금 ${won(balance)} < 필요 ${won(min)}. 잔액 보충은 공통 setup의 일이라 여기서 채우지 않습니다.`);
    }
    return balance;
}

export type CreatedPost = { postId: number; title: string; productName: string; inventoryId: number; price: number };

/** 판매자(request)가 판매글 하나(상품 하나 · 옵션 없음)를 API로 등록하고 id를 돌려준다. 제목에 runId가 붙는다. */
export async function createPost(seller: APIRequestContext, opts: { name: string; price: number; stock?: number }): Promise<CreatedPost> {
    const sellerInfo = await json(await seller.get('/api/members/me/seller'), '판매자 정보 조회');
    const sellerId = Number(sellerInfo.id ?? sellerInfo.sellerId);
    const title = withRunId(opts.name);
    const res = await seller.post('/api/sales-posts', {
        multipart: {
            request: {
                name: 'request',
                mimeType: 'application/json',
                buffer: Buffer.from(
                    JSON.stringify({
                        sellerId,
                        title,
                        content: `${opts.name} 설명`,
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
            images: { name: 'img.png', mimeType: 'image/png', buffer: PNG },
        },
    });
    if (!res.ok()) throw new Error(`판매글 등록 실패: ${res.status()} ${(await res.text()).slice(0, 300)}`);
    const list = await json(await seller.get(`/api/sales-posts/sellers/${sellerId}/posts?page=0&size=50`), '내 판매글 목록');
    const post = (list.content ?? []).find((p: Json) => p.title === title);
    if (!post) throw new Error(`방금 등록한 판매글(${title})을 내 판매글 목록에서 찾지 못했습니다.`);
    const postId = Number(post.postId ?? post.id);
    const detail = await json(await seller.get(`/api/sales-posts/detail/${postId}`), '판매글 상세');
    const inventory = detail.productList?.[0]?.inventoryList?.[0];
    const inventoryId = Number(inventory?.inventoryId ?? inventory?.id);
    if (!inventoryId) throw new Error(`재고 id를 찾지 못했습니다: ${JSON.stringify(detail).slice(0, 300)}`);
    return { postId, title, productName: opts.name, inventoryId, price: opts.price };
}

// ===== 공동물품(N빵) =====

/** 목록(페이지를 넘기며)에서 판매글 제목으로 그 글의 "선택" 버튼을 찾는다. */
export async function findPickButton(page: Page, postTitle: string): Promise<Locator> {
    // 목록이 로딩 스켈레톤에서 바뀔 때까지 기다린다(첫 페이지에 상품 버튼이 하나라도 뜨거나 빈 안내가 뜬다)
    await expect(page.getByRole('button', { name: /^선택$|^담기$|^선택됨$|^판매 중지$/ }).first().or(page.getByText('고를 수 있는 판매 상품이 없습니다.'))).toBeVisible();
    for (let i = 0; i < 15; i++) {
        const row = page.locator('li', { has: page.getByText(postTitle, { exact: true }) }).last();
        if (await row.isVisible().catch(() => false)) return row.getByRole('button', { name: /^선택$|^담기$/ });
        const next = page.getByRole('button', { name: '다음 페이지' });
        if (!(await next.isVisible().catch(() => false)) || (await next.isDisabled())) break;
        await next.click();
        await page.waitForTimeout(400);
    }
    throw new Error(`상품 고르기 목록에서 판매글(${postTitle})을 찾지 못했습니다.`);
}

/** 만든 사람이 N빵을 만들고 생성 완료 화면에서 id · 초대 코드를 읽는다. */
export async function createSharedGroup(page: Page, title: string, maxParticipants: number): Promise<{ id: number; code: string }> {
    await page.goto('/group-purchases/new');
    await page.locator('#group-title').fill(title);
    await page.locator('#max-participants').fill(String(maxParticipants));
    await page.getByText('[필수] 공동구매 진행 규칙 확인 및 동의').click();
    await page.getByRole('button', { name: '공동구매 만들기' }).click();
    await page.waitForURL(/\/group-purchases\/new\/complete\?id=\d+/);
    const id = Number(new URL(page.url()).searchParams.get('id'));
    const codeButton = page.getByRole('button', { name: /^초대 코드 복사 · / });
    await expect(codeButton).toBeVisible();
    const code = ((await codeButton.innerText()).split('·')[1] ?? '').trim();
    expect(code).toMatch(/^[a-z0-9]{12}$/);
    return { id, code };
}

/** 참여자 수 배지("2명 / 최대 3명"). 같은 글자가 화면에 두 번 나올 수 있어 첫 번째를 쓴다. */
export const headcount = (page: Page, text: string) => page.getByText(text).first();

export const invitePath = (id: number, code: string) => `/group-purchases/${id}/invite?code=${code}`;

/** 참여자가 초대 링크로 들어와 참여하고 상세 화면까지 간다. */
export async function joinByInvite(page: Page, id: number, code: string) {
    await page.goto(invitePath(id, code));
    await page.getByRole('button', { name: '공동구매 참여하기' }).click();
    const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first();
    await Promise.race([
        page.waitForURL(new RegExp(`/group-purchases/${id}$`)),
        alert.waitFor({ timeout: 30_000 }).then(async () => {
            throw new Error(`참여 실패 안내: ${(await alert.innerText()).trim()}`);
        }),
    ]);
}

/** 상품 담기 화면에서 판매글의 상품을 골라 공동 장바구니에 담는다(옵션 없는 상품). */
export async function addSharedItem(page: Page, id: number, post: CreatedPost, quantity = 1) {
    await page.goto(`/group-purchases/${id}/options`);
    await (await findPickButton(page, post.title)).click();
    await page.getByLabel('수량').fill(String(quantity));
    await page.getByRole('button', { name: '공동 장바구니에 담기' }).click();
    await expect(page.getByText(`${quantity}개를 담았습니다`)).toBeVisible();
}

/**
 * 만든 사람이 상세에서 마감한다. BE는 같은 요청 안에서 공동 주문까지 만들어 상태가 바로 ORDER_CREATED("주문 생성")가 된다.
 * (알려진 FE 문제: 이 상태의 상세에는 "내 몫 결제하기" 링크가 없다 — 이슈 참고. 그래서 결제는 내 공동 주문 목록(API)에서 주문 id를 찾아 결제 화면으로 간다.)
 */
export async function closeSharedGroup(page: Page, id: number) {
    await page.goto(`/group-purchases/${id}`);
    await page.getByRole('button', { name: '지금 마감하기' }).click();
    await sharedOrderIdOf(page, id); // 공동 주문이 만들어질 때까지
}

/** 내 공동 주문 목록(API)에서 이 공동구매의 공동 주문 id를 찾는다. */
export async function sharedOrderIdOf(page: Page, sharedGroupPurchaseId: number): Promise<number> {
    let found = 0;
    await expect
        .poll(
            async () => {
                const body = (await (await page.context().request.get('/api/group-orders/shared/me')).json()) as Json;
                const list = (body.data ?? body) as Json[];
                found = Number(list.find((o) => Number(o.sharedGroupPurchaseId) === sharedGroupPurchaseId)?.id ?? 0);
                return found;
            },
            { timeout: 30_000, intervals: [1_000] },
        )
        .toBeGreaterThan(0);
    return found;
}

/** 내 몫 결제 화면(/checkout/shared?order=)으로 가서 공동 주문 id를 돌려준다. */
export async function openSharedPayment(page: Page, id: number): Promise<number> {
    const orderId = await sharedOrderIdOf(page, id);
    await page.goto(`/checkout/shared?order=${orderId}`);
    return orderId;
}

/** 결제 버튼에 적힌 내 분담금(예: "5,000원 결제하기"). */
export async function shareAmount(page: Page): Promise<number> {
    const button = page.getByRole('button', { name: /원 결제하기$/ });
    await expect(button).toBeVisible();
    return parseWon(await button.innerText());
}

/** 분담금 결제: 만든 사람이면 팀 배송지를 채우고, 동의한 뒤 결제한다. */
export async function paySharedShare(page: Page) {
    const address = page.getByRole('region', { name: '팀 배송지' });
    if (await address.isVisible().catch(() => false)) {
        const fill = async (label: string, value: string, exact = false) => {
            const field = address.getByLabel(label, { exact });
            if (!(await field.inputValue())) await field.fill(value);
        };
        await fill('받는 분', 'e2e 수령인');
        await fill('연락처', '010-9000-1234');
        await fill('우편번호', '06234');
        await fill('주소', '서울특별시 강남구 테헤란로 123', true);
    }
    await page.getByText(/결제하면 예치금에서 바로 차감됩니다/).click();
    await page.getByRole('button', { name: /원 결제하기$/ }).click();
}

/**
 * 공동구매 남용 제한(만든 사람 취소 · 나가기 등이 쌓이면 CAUTION → RESTRICTED) 풀기.
 * 이 흐름은 취소 · 나가기를 되풀이하므로 테스트 시작 전에 관리자 API(`POST /api/admin/abuse/members/{id}/release`)로 쓰는 계정의 제한과 점수 기준점을 지운다.
 * 관리자 쿠키는 setup이 막 저장한 로그인 상태(storageState)를 읽는다. 쓰는 것은 로컬 환경의 order 서비스뿐이다.
 */
export async function releaseAbuse(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string | undefined, keys: AccountKey[]) {
    // FE에는 이 관리자 API의 프록시가 없어 로컬 order 서비스(18986)를 직접 부른다. 쿠키(localhost)는 포트와 무관하게 실린다.
    const admin = await playwright.request.newContext({ baseURL: 'http://localhost:18986', storageState: authFile('admin') });
    try {
        for (const key of keys) {
            const me = await playwright.request.newContext({ baseURL, storageState: authFile(key) });
            try {
                const memberId = Number((await json(await me.get('/api/members/me'), `${key} 내 정보`)).id);
                const res = await admin.post(`/api/admin/abuse/members/${memberId}/release`, { data: { reason: 'e2e 반복 실행을 위한 제한 해제' } });
                if (!res.ok()) throw new Error(`${key} 남용 제한 해제 실패: ${res.status()} ${(await res.text()).slice(0, 200)}`);
            } finally {
                await me.dispose();
            }
        }
    } finally {
        await admin.dispose();
    }
}
