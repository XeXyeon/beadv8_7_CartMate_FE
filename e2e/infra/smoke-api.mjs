// e2e:env 가 제대로 떴는지 API 로 한 번 확인한다: 회원 로그인 → 판매글 등록 → 장바구니 → 주문 → 예치금 결제 → 배송 생성(Kafka 경유)
//   node e2e/infra/smoke-api.mjs
// 본격 bootstrap(고정 계정 5개)은 QA-2 가 맡는다. 이 스크립트는 환경 검증용이라 자기 계정(smoke-*)만 만들고, 이미 있으면 재사용한다.
// DB 접속은 mysql 클라이언트 없이 `docker compose exec` 로 한다. 대상은 compose 의 로컬 컨테이너뿐이다.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const compose = path.join(path.dirname(fileURLToPath(import.meta.url)), 'compose.yaml')
const URLS = { member: 'http://localhost:18981', product: 'http://localhost:18982', order: 'http://localhost:18986', payment: 'http://localhost:18983', etc: 'http://localhost:18984' }
// BCrypt(test1234) — seed-local.sh 와 같은 값
const PW_HASH = '$2y$10$.GdXZqlMdvdHMkGnpmi90OXD/2k5zyh3A07HHYkG0mhdir5ek2ebS'

const sql = (svc, q) =>
  execFileSync('docker', ['compose', '-f', compose, 'exec', '-T', `mysql-${svc}`, 'mysql', '-uroot', '-pe2e-root', '-N', '-B', `cartmate_${svc}`, '-e', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const step = (m) => console.log(`\n▶ ${m}`)
const fail = (m) => { console.error(`✗ ${m}`); process.exit(1) }

function ensureMember(email, nickname, phone, role) {
  const id = sql('member', `SELECT id FROM member WHERE email='${email}'`)
  if (id) return Number(id)
  sql('member', `INSERT INTO member (created_at, updated_at, birth_date, email, nickname, password, phone, role, status)
    VALUES (NOW(6), NOW(6), '1990-01-01', '${email}', '${nickname}', '${PW_HASH}', '${phone}', '${role}', 'ACTIVE')`)
  return Number(sql('member', `SELECT id FROM member WHERE email='${email}'`))
}
function ensureWallet(memberId, balance) {
  if (!sql('payment', `SELECT id FROM wallet WHERE member_id=${memberId}`))
    sql('payment', `INSERT INTO wallet (balance, created_at, member_id, updated_at, version) VALUES (${balance}, NOW(6), ${memberId}, NOW(6), 0)`)
  else sql('payment', `UPDATE wallet SET balance=${balance} WHERE member_id=${memberId}`)
}

// 신뢰 기기 행을 심어 메일 2차 인증을 건너뛴다(BE 는 토큰 SHA-256 hex 만 저장)
async function login(email, memberId) {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  sql('member', `SET time_zone='+09:00'; INSERT INTO trusted_device (created_at, updated_at, device_name, expires_at, last_used_at, member_id, token_hash)
    VALUES (NOW(6), NOW(6), 'smoke-api', NOW(6) + INTERVAL 10 MINUTE, NOW(6), ${memberId}, '${hash}')`)
  const res = await fetch(`${URLS.member}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `trustedDevice=${token}` },
    body: JSON.stringify({ email, password: 'test1234', remember: false }),
  })
  if (!res.ok) fail(`${email} 로그인 ${res.status}: ${await res.text()}`)
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => /^accessToken=/.test(c)).join('; ')
  if (!cookie) fail(`${email} 로그인 응답에 accessToken 쿠키가 없다`)
  return cookie
}

const call = async (base, cookie, method, p, body, headers = {}) => {
  const res = await fetch(`${base}${p}`, { method, headers: { cookie, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) fail(`${method} ${p} → ${res.status} ${text.slice(0, 300)}`)
  return json.data ?? json
}

step('서비스 응답 확인')
for (const [n, u] of Object.entries(URLS)) {
  const r = await fetch(`${u}/actuator/health/readiness`).catch(() => null)
  if (!r) fail(`${n} 응답 없음`)
  console.log(`  ${n}: ${r.status}`)
}

step('계정 · 지갑 준비')
const admin = ensureMember('smoke-admin@example.test', 'smokeadmin', '010-9000-0001', 'ADMIN') // 플랫폼 회원(id 1) 자리
const seller = ensureMember('smoke-seller@example.test', 'smokeseller', '010-9000-0002', 'SELLER')
const buyer = ensureMember('smoke-buyer@example.test', 'smokebuyer', '010-9000-0003', 'BUYER')
for (const id of [admin, seller]) ensureWallet(id, 0)
ensureWallet(buyer, 500000)
if (!sql('member', `SELECT id FROM seller WHERE member_id=${seller}`))
  sql('member', `INSERT INTO seller (id, created_at, updated_at, account_holder, account_number, bank_name, phone_number, seller_type, status, member_id)
    VALUES (${seller}, NOW(6), NOW(6), '스모크판매자', '1002000000000', 'KB', '01090000002', 'INDIVIDUAL', 'ACTIVE', ${seller})`)
console.log(`  admin=${admin} seller=${seller} buyer=${buyer}`)

step('회원 로그인 (member-service)')
const sellerCookie = await login('smoke-seller@example.test', seller)
const buyerCookie = await login('smoke-buyer@example.test', buyer)
console.log('  판매자 · 구매자 로그인 OK')

step('판매글 등록 (product-service, 이미지 업로드 포함)')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const title = `[smoke] 판매글 ${Date.now()}`
const form = new FormData()
form.append('request', new Blob([JSON.stringify({
  sellerId: seller, title, content: '[smoke] 환경 확인용',
  productList: [{ categoryId: 1, name: '스모크 상품', description: '스모크 상품 설명', basePrice: 10000, productImageList: [{ imageSeq: 1 }], inventoryList: [{ optionList: [], additionalPrice: 0, stockQuantity: 10 }] }],
})], { type: 'application/json' }))
form.append('images', new Blob([png], { type: 'image/png' }), 'img.png')
const post = await call(URLS.product, sellerCookie, 'POST', '/api/sales-posts', form)
// 등록 응답 본문이 비어 있어 DB 에서 id 를 찾는다
const postId = sql('product', `SELECT id FROM post_sales_post WHERE seller_id=${seller} ORDER BY id DESC LIMIT 1`)
if (!postId) fail('등록한 판매글을 DB 에서 찾지 못함')
console.log(`  판매글 등록 OK (id=${postId}, 응답: ${JSON.stringify(post)})`)
const detail = await call(URLS.product, buyerCookie, 'GET', `/api/sales-posts/detail/${postId}`)
const inventoryId = detail.productList?.[0]?.inventoryList?.[0]?.inventoryId ?? detail.productList?.[0]?.inventoryList?.[0]?.id
if (!inventoryId) fail(`재고 id 를 찾지 못함: ${JSON.stringify(detail).slice(0, 400)}`)

step('장바구니 → 주문 → 예치금 결제')
await call(URLS.order, buyerCookie, 'POST', '/api/carts/items', { inventoryId, quantity: 1 })
const cart = await call(URLS.order, buyerCookie, 'GET', '/api/carts')
const items = JSON.stringify(cart).match(/"cartItemId":(\d+)/g) ?? []
const cartItemId = Number(items.at(-1)?.split(':')[1])
if (!cartItemId) fail(`장바구니 항목 id 를 찾지 못함: ${JSON.stringify(cart).slice(0, 400)}`)
const order = await call(URLS.order, buyerCookie, 'POST', '/api/orders', {
  cartItemIds: [cartItemId],
  deliveryAddress: { receiverName: '스모크', receiverPhone: '010-9000-0003', zipCode: '06234', address: '서울특별시 강남구 테헤란로 123', addressDetail: '4층' },
})
const orderId = order.orderId ?? order.id
console.log(`  주문 생성 OK (orderId=${orderId})`)
await call(URLS.order, buyerCookie, 'POST', `/api/orders/${orderId}/payment`, {})
console.log('  예치금 결제 OK')
const bal = sql('payment', `SELECT balance FROM wallet WHERE member_id=${buyer}`)
console.log(`  구매자 잔액: ${bal} (결제 전 500000)`)

step('배송 생성 확인 (Kafka 경유: order → etc)')
let delivery = ''
for (let i = 0; i < 30 && !delivery; i++) {
  delivery = sql('etc', `SELECT CONCAT('id=', id, ' status=', status) FROM delivery WHERE order_id=${orderId} LIMIT 1`).split('\n')[0]
  if (!delivery) await new Promise((r) => setTimeout(r, 2000))
}
if (!delivery) fail('60초 안에 배송이 생성되지 않았다 (Kafka 이벤트 전달 확인 필요)')
console.log(`  배송 생성 OK: ${delivery}`)
step('예치금 충전(E02) API: 충전 주문 생성 → 토스 승인 호출(가짜 paymentKey)')
const charge = await call(URLS.payment, buyerCookie, 'POST', '/api/wallets/me/charges', { amount: 10000, idempotencyKey: `smoke-${Date.now()}` })
const orderNumber = charge.orderNumber ?? JSON.stringify(charge).match(/"orderNumber":"([^"]+)"/)?.[1]
console.log(`  충전 주문 생성 OK (orderNumber=${orderNumber})`)
const conf = await fetch(`${URLS.payment}/api/wallets/me/charges/confirm`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: buyerCookie },
  body: JSON.stringify({ orderNumber, paymentKey: 'smoke_fake_payment_key', amount: 10000 }),
})
// 가짜 키라 승인은 거절돼야 한다. 거절 사유가 토스에서 온 것(키 인증은 통과)인지 BE 응답으로 가늠한다
console.log(`  승인 응답 ${conf.status}: ${(await conf.text()).slice(0, 200)}`)

console.log('\n✔ smoke 통과: 로그인 · 판매글 등록 · 결제 → 배송 생성')
