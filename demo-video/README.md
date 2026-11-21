# 시연 영상 (QA-8)

Playwright로 화면을 녹화하고, macOS `say`(한국어 Yuna)로 만든 소개 음성을 ffmpeg로 입혀 mp4 하나로 합친다.
E2E(`e2e/`)와 따로 돈다: 설정은 `playwright.demo.config.ts`, 장면은 `demo-video/scenes/*.demo.ts`. `npm run e2e`는 이 폴더를 보지 않는다.
E2E 지원 코드(`e2e/support/*`)는 그대로 가져다 쓴다(코드를 고치지 않는다).

## 준비
- 로컬 도커 환경이 떠 있어야 한다: `npm run e2e:env:up` (`cartmate-e2e-*`, 포트 1898x). `.env.e2e`(토스 테스트 키)도 필요하다.
- 시연용 FE는 운영 빌드를 쓴다(개발 서버는 첫 방문마다 느려 영상이 끊긴다): `npm run demo:build`. 이미 5173에 떠 있으면 그대로 쓰고, 없으면 녹화가 `next start`로 띄운다.
- `ffmpeg` · `say`(Yuna 음성)가 필요하다.

## 만들기
```bash
rm -f ~/Movies/cartmate-demo/work/scene-*.json   # 이전 기록 지우기(빼고 싶은 장면이 남지 않게)
npm run demo:record                              # 장면 00~14 녹화(실행 잠금 /tmp/cartmate-e2e-run.lock을 잡는다, 약 11분)
npm run demo:compose                             # 음성 입혀 합치기 → cartmate-demo.mp4 · script.md
```
- 출력 폴더: `~/Movies/cartmate-demo/` (`DEMO_OUT`으로 바꿈). 중간 파일은 `work/`.
- 한 장면만: `npm run demo:record -- -g "장면 05"`. 장면은 번호 순서로 앞 장면의 결과를 이어 쓴다(1에서 가입한 회원이 이후 시연 판매자가 된다: 1 → 3 → 4 → 5 → 6 → 10 → 11 → 12). 한 장면만 다시 찍을 때는 그 장면이 쓰는 앞 장면 결과가 `work/*.json`에 남아 있어야 한다. 장면 10~12는 배송 · 클레임 · 정산이 한 번 지나가면 되돌릴 수 없어, 다시 찍으려면 장면 1부터 다시 돌린다.
- 길이를 위해 기본 제외: 교환(E20). `DEMO_EXTRAS=1`로 넣을 수 있다(영상이 10분을 넘을 수 있다).
- `DEMO_RATE`(말 속도, 기본 200) · `DEMO_SLOWMO`(동작 간격 ms, 기본 160) · `DEMO_VOICE`(기본 Yuna).

## 구성
- `support/narrate.ts`: 구간(계정 하나 = 브라우저 컨텍스트 하나 = webm 하나)과 `beat(문장, 동작)`. 문장을 말하는 동안 화면이 머물고, 자막(화면 아래)과 문장 시작 시각을 기록한다.
- `compose.mjs`: 구간마다 음성을 시작 시각에 맞춰 얹어 H.264 mp4로 만들고 이어 붙인다. 장면별 대본(`script.md`)도 쓴다.
- `run-locked.sh`: 도커 환경 · 고정 계정 · 5173을 E2E와 함께 쓰므로 실행 잠금을 잡고 돈다.

## 화면 밖에서 하는 준비(영상에는 안 나오는 것)
- 판매글(장면 7 · 8 · 9 · 13)과 N빵 준비(장면 8)는 API · 화면 조작으로 미리 만든다. 잔액은 로컬 payment DB에 직접 맞춘다(E2E와 같은 방식).
- 장면 12의 지급 배치: 지급 예정일(다음 달 15일)을 기다릴 수 없어, 시연 판매자의 대기 정산만 지급 대상으로 당기고 payment 서비스의 지급 cron을 매분으로 바꿔 지급시킨 뒤 원래 값으로 되돌린다. 배치는 같은 날 한 번만 돌아서, 오늘 돈 기록이 있으면 로컬 DB의 오늘자 `payoutJob` 실행 기록을 지운다.
- 장면 2의 카드사 인증 이후 승인은 compose의 가짜 토스(`toss-stub`)가 대신한다(`e2e/infra/README.md`).
