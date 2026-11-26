# CartMate Frontend

장바구니를 함께 채우는 공동구매 커머스 CartMate의 웹 프론트엔드입니다.

> 이 저장소는 프로그래머스 데브코스 팀 프로젝트 **CartMate**의 미러입니다.
> 원본: [prgrms-be-adv-devcourse/beadv8_7_CartMate_FE](https://github.com/prgrms-be-adv-devcourse/beadv8_7_CartMate_FE) · 커밋 기록은 원본 그대로입니다.

## 팀

| 이름 | GitHub | 백엔드 | 프론트엔드 |
|---|---|---|---|
| 박제현 | [@XeXyeon](https://github.com/XeXyeon) | 주문 서비스(장바구니 · 공동구매 · 주문 · 어뷰징 탐지), 회원 · 예치금 · 배송 일부 | 공동구매, 주문 · 주문 상세, 예치금, 상품 상세, 공통 기반 · UI 통일 · 배포 |
| 신동원 | [@sdw51](https://github.com/sdw51) | 배송 · 정산(etc 서비스), 주문, 검색, 결제 · 지급 | 판매자 취소/반품 · 정산 · 배송, 주문 취소, 예치금, 검색 |
| 김태수 | [@Ktaesu](https://github.com/Ktaesu) | 회원 · 인증(MFA · 신뢰 기기 · 탈퇴), 예치금, 쿠폰 | 회원정보, 관리자 회원 · 판매글, 공동 주문 결제, 쿠폰 |
| 김산 | [@rlatks1217](https://github.com/rlatks1217) | 상품 서비스(판매글 · 상품 · 페이백 · 이벤트) | 판매자 상품 관리, 상품 상세 리뷰 · 댓글 |

## 기술 스택
- Next.js 16 · React 19 · TypeScript
- TanStack Query, orval(OpenAPI → API 훅 생성)
- Astryx 디자인 시스템 · Tailwind CSS 4
- Vercel 배포 (GitHub Actions)

## 실행

```bash
npm ci
npm run dev        # http://localhost:3000
npm run api:gen    # BE OpenAPI로 API 코드 다시 생성
npm run build
npm run lint
```

BE 주소 등 환경 변수는 `.env.example`을 참고합니다. `/api/*` 요청은 Next rewrites로 서비스별 BE에 전달됩니다.
