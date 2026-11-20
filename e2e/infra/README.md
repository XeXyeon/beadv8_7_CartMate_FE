# E2E 로컬 환경 (운영 k3s 동등, docker compose)

```bash
npm run e2e:env:up       # 첫 회는 BE 이미지 5개를 빌드해 10분 안팎, 이후 1~2분
npm run e2e:env:down     # 내림(데이터 유지)
npm run e2e:env:reset    # 볼륨 삭제 후 다시(DB 초기화)
npm run e2e:env:status   # 상태 · 메모리
node e2e/infra/smoke-api.mjs   # 로그인 → 판매글 → 결제 → 배송 생성 API 확인
```

| 대상 | 호스트 포트 |
|---|---|
| BE member · product · payment · etc · order | 18981 · 18982 · 18983 · 18984 · 18986 |
| MySQL member · product · order · payment · etc (`cartmate_<서비스>`, 사용자 `cartmate/cartmate`, root `e2e-root`) | 13306 · 13307 · 13308 · 13309 · 13310 |
| Redis cache · core (비밀번호 `e2e-redis`) | 16379 · 16380 |
| Elasticsearch (`elastic/e2e-elastic`) | 19200 |
| Kafka (호스트용 리스너) | 19092 |

- 이미지 버전은 BE `k8s/infra/*.yaml` 과 같다(MySQL 8.4.13, Kafka 4.3.2 KRaft, Redis 7.4.11, ES 9.5.5 + nori). BE 이미지는 BE 저장소 `origin/dev` 를 `git archive` 로 읽어 `e2e/infra/.be-src` 에 풀어 빌드한다(BE 저장소는 수정하지 않는다). `E2E_BE_DIR` · `E2E_BE_REF` 로 바꾼다.
- 설정은 저장소 루트 `.env.e2e`(gitignore)에서 읽는다. 토스 테스트 키 자리: `TOSS_SECRET_KEY`(BE), `NEXT_PUBLIC_TOSS_CLIENT_KEY`(FE). 예시는 `e2e/infra/.env.example`.
- 운영과 다른 점: ① product-service 만 `dev` 프로필(운영 `prod` 는 S3 에만 사진을 올려 로컬 등록이 안 됨) ② 배송 자동 완료 10초(운영 300초, `E2E_DELIVERY_COMPLETE_SECONDS`) ③ 출금 이체 `fake`(운영 `manual`) ④ 메일 발송 끔(코드는 member 로그) ⑤ JVM `-Xmx448m` 고정 ⑥ trace 끔.
- 관리자 OTP 암호화 키는 BE 기본값과 같은 값을 compose 에 명시했다.

## 인증 코드 · 정산 (E2E 가 직접 처리)
- 메일 인증 코드: member-service 가 `MAIL_ENABLED=false`(prod 프로필의 `true` 를 환경 변수로 다시 끔)라 SMTP 로 안 나가고 로그 `[인증 메일 — 발송 안 함]` 에 찍힌다. 휴대폰 코드는 `[휴대폰 인증] … → 인증번호`. 코드는 Redis 에 HMAC 해시로만 있어 로그에서 읽는다.
  ```bash
  docker logs cartmate-e2e-member-service-1 2>&1 | grep -E '인증 메일|휴대폰 인증' | tail -5
  ```
  컨테이너 이름: `cartmate-e2e-<서비스>-1` (member-service · product-service · payment-service · etc-service · order-service, mysql-<서비스>, redis-cache · redis-core, kafka, elasticsearch).
- 오픈뱅킹: `OPENBANKING_MODE=fake` 를 모든 서비스에 명시(계좌번호 끝 0000 불일치, 9999 → 503, 그 외 통과).
- 정산 지급 cron: payment-service `CUSTOM_PAYOUT_CRON`, 기본 `0 10 0 * * *`. 매분으로 돌리려면 `E2E_PAYOUT_CRON="0 * * * * *" npm run e2e:env:up`.
