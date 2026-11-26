# CartMate Frontend

장바구니를 함께 채우는 공동구매 커머스 **CartMate**의 웹 프론트엔드입니다.

> 이 저장소는 프로그래머스 데브코스 팀 프로젝트 **CartMate**의 미러입니다.
> 원본: [prgrms-be-adv-devcourse/beadv8_7_CartMate_FE](https://github.com/prgrms-be-adv-devcourse/beadv8_7_CartMate_FE) · 커밋 기록은 원본 그대로입니다.
> 백엔드: [XeXyeon/beadv8_7_CartMate_BE](https://github.com/XeXyeon/beadv8_7_CartMate_BE)

## 서비스 소개

CartMate는 사람들이 장바구니에 담아 둔 상품을 모아 공동구매로 묶어 주는 커머스입니다.

- **수요 공동구매:** 여러 회원의 장바구니에 같은(또는 비슷한) 상품이 쌓이면 관리자가 공동구매를 열고, 담아 둔 회원이 내 장바구니로 바로 참여합니다.
- **개인물품 · 공동물품 공동구매:** 회원이 직접 공동구매를 열어 함께 살 사람을 모읍니다.
- **페이백:** 공동구매가 목표 수량을 넘기면 참여자에게 예치금으로 일부를 돌려줍니다.
- **어뷰징 방지:** 방장 취소 · 이탈 · 미결제 같은 신호를 모아 반복하는 계정은 참여를 제한합니다.

## 화면 구성

| 영역 | 경로 | 주요 화면 |
|---|---|---|
| 쇼핑 | `src/app/(shop)` | 홈, 검색, 상품 상세(리뷰 · 댓글), 장바구니, 결제(토스페이먼츠), 공동구매 목록 · 상세, 공지, 1:1 문의 |
| 마이페이지 | `src/app/(shop)/mypage` | 주문 · 주문 상세, 취소/반품, 배송, 예치금, 쿠폰, 찜, 리뷰, 배송지, 회원정보, 판매자 신청 |
| 인증 | `src/app/(auth)`, `otp-setup` | 로그인(MFA), 회원가입, 관리자 OTP 등록 |
| 판매자 | `src/app/seller` | 상품 관리, 배송, 취소/반품 처리, 정산, 정산 계좌 |
| 관리자 | `src/app/admin` | 회원 · 판매글 관리, 수요 장바구니 · 공동구매 개설, 쿠폰, 공지 |

## 기술 스택

- **프레임워크:** Next.js 16 (App Router) · React 19 · TypeScript
- **서버 상태:** TanStack Query, orval(BE OpenAPI → API 클라이언트 · 훅 자동 생성)
- **폼:** React Hook Form · Zod
- **UI:** Astryx 디자인 시스템 · StyleX · Tailwind CSS 4
- **결제:** 토스페이먼츠 SDK
- **배포:** Vercel (GitHub Actions에서 lint · build 후 main 병합 시 운영 배포)

## 구조

```
src/
├─ app/          라우트 (shop · auth · seller · admin)
├─ api/          orval이 만든 API 코드, 서비스별 BE 주소 · rewrites 규칙
├─ components/   공통 레이아웃 · UI 컴포넌트
├─ lib/          세션 · 경로 · 포맷 등 공용 로직
├─ theme/        디자인 토큰
└─ proxy.ts      로그인 · 권한이 필요한 경로 사전 차단
openapi/         BE에서 받아 온 OpenAPI 문서
scripts/         OpenAPI 받기 · 변환, 로컬 시드 데이터
```

- 브라우저는 FE와 같은 주소의 `/api/*`만 부르고, Next rewrites가 경로 접두어로 5개 BE 서비스에 나눠 보냅니다(`src/api/services.ts`). 쿠키 인증이 같은 출처에서 동작하고 CORS 설정이 필요 없습니다.
- BE OpenAPI가 바뀌면 `npm run api:pull && npm run api:gen`으로 타입과 훅을 다시 만듭니다.

## 팀

| 이름 | GitHub | 백엔드 | 프론트엔드 |
|---|---|---|---|
| 박제현 | [@XeXyeon](https://github.com/XeXyeon) | 주문 서비스(장바구니 · 공동구매 · 주문), 어뷰징 탐지, 페이백, 장바구니 수요 매칭(벡터 · LLM), Outbox → Kafka 연결 기반 · Inbox | 공동구매, 장바구니 · 주문 · 주문 상세, 예치금, 상품 상세, 공통 기반 · UI 통일 |
| 신동원 | [@sdw51](https://github.com/sdw51) | 배송 · 정산(etc 서비스), 클레임(취소 · 반품) · 환불, 검색, 결제 · 지급 | 판매자 취소/반품 · 정산 · 배송, 주문 취소, 예치금, 검색 |
| 김태수 | [@Ktaesu](https://github.com/Ktaesu) | 회원 · 인증(MFA · 신뢰 기기 · 탈퇴), 예치금, 쿠폰, 관측 스택(Loki · Tempo · Grafana) | 회원정보, 관리자 회원 · 판매글, 공동 주문 결제, 쿠폰 |
| 김산 | [@rlatks1217](https://github.com/rlatks1217) | 상품 서비스(판매글 · 상품 · 이벤트), 인프라(k3s · Docker · CI/CD), 성능 튜닝 | 판매자 상품 관리, 상품 상세 리뷰 · 댓글, CI · Vercel 배포 |

## 실행

```bash
npm ci
npm run dev        # http://localhost:3000
npm run api:pull   # BE에서 OpenAPI 문서 받기
npm run api:gen    # OpenAPI로 API 코드 다시 생성
npm run seed:local # 로컬 BE에 테스트 계정 · 판매글 넣기
npm run build
npm run lint
```

BE 주소 등 환경 변수는 `.env.example`을 참고합니다.
