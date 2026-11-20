#!/usr/bin/env bash
# 운영(k3s) 동등 로컬 E2E 환경: docker compose 로 MySQL 5 · Redis 2 · Kafka · ES · BE 서비스 5개를 띄운다.
#
#   npm run e2e:env:up      # BE 소스 준비 → 이미지 빌드(첫 회 수 분) → 기동 → 준비 확인
#   npm run e2e:env:down    # 컨테이너 내림(데이터 볼륨 유지)
#   npm run e2e:env:reset   # 볼륨까지 지우고 처음부터(DB 초기화 → bootstrap 을 다시 돌려야 한다)
#   npm run e2e:env:status  # 컨테이너 상태와 메모리 사용량
#
# 설정(저장소 루트 .env.e2e, 선택): TOSS_SECRET_KEY, E2E_BE_DIR, E2E_BE_REF, E2E_JVM_XMX ...  (e2e/infra/.env.example 참고)
# BE 저장소는 수정하지 않는다. `git archive` 로 읽기만 해서 e2e/infra/.be-src 에 풀고 거기서 이미지를 만든다.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$INFRA_DIR/../.." && pwd)"
SERVICES=(member-service product-service payment-service etc-service order-service)
# 호스트 포트(compose.yaml 과 같다)
PORTS=(18981 18982 18983 18984 18986)

if [ -f "$ROOT_DIR/.env.e2e" ]; then
    set -a; . "$ROOT_DIR/.env.e2e"; set +a
fi
BE_DIR="${E2E_BE_DIR:-$HOME/WebstormProjects/beadv8_7_CartMate_BE}"
BE_REF="${E2E_BE_REF:-origin/dev}"
SRC_DIR="$INFRA_DIR/.be-src"
COMPOSE=(docker compose -f "$INFRA_DIR/compose.yaml")

ensure_docker() {
    if docker info >/dev/null 2>&1; then return; fi
    echo "Docker 가 꺼져 있다 → Docker Desktop 을 켠다"
    open -a Docker
    for _ in $(seq 1 90); do
        docker info >/dev/null 2>&1 && return
        sleep 2
    done
    echo "Docker 가 3분 안에 켜지지 않았다" >&2; exit 1
}

prepare_be_source() {
    [ -d "$BE_DIR/.git" ] || { echo "BE 저장소가 없다: $BE_DIR (E2E_BE_DIR 로 지정)" >&2; exit 1; }
    local sha; sha="$(git -C "$BE_DIR" rev-parse "$BE_REF")"
    if [ -f "$SRC_DIR/.sha" ] && [ "$(cat "$SRC_DIR/.sha")" = "$sha" ]; then
        echo "BE 소스: $BE_REF ($sha) 이미 준비됨"; return
    fi
    echo "BE 소스: $BE_REF ($sha) 를 읽기 전용으로 푼다"
    rm -rf "$SRC_DIR"; mkdir -p "$SRC_DIR"
    git -C "$BE_DIR" archive "$sha" | tar -x -C "$SRC_DIR"
    echo "$sha" > "$SRC_DIR/.sha"
    rm -f "$INFRA_DIR/.images-built"
}

build_images() {
    local sha; sha="$(cat "$SRC_DIR/.sha")"
    if [ -f "$INFRA_DIR/.images-built" ] && [ "$(cat "$INFRA_DIR/.images-built")" = "$sha" ]; then
        echo "BE 이미지: $sha 로 이미 빌드됨"; return
    fi
    for s in "${SERVICES[@]}"; do
        echo "BE 이미지 빌드: $s"
        docker build -q --build-arg "SERVICE=$s" -t "cartmate-e2e-$s" "$SRC_DIR" >/dev/null
    done
    echo "$sha" > "$INFRA_DIR/.images-built"
}

wait_http() {
    # 서비스 포트가 HTTP 로 응답하면 준비된 것(404 도 응답이다)
    local ok
    for i in "${!SERVICES[@]}"; do
        ok=0
        for _ in $(seq 1 90); do
            if curl -s -o /dev/null --max-time 3 "http://localhost:${PORTS[$i]}/actuator/health/readiness"; then ok=1; break; fi
            sleep 2
        done
        [ "$ok" = 1 ] || { echo "응답 없음: ${SERVICES[$i]} (localhost:${PORTS[$i]})" >&2; exit 1; }
        echo "OK  ${SERVICES[$i]}  http://localhost:${PORTS[$i]}"
    done
}

cmd_up() {
    ensure_docker
    prepare_be_source
    build_images
    "${COMPOSE[@]}" build elasticsearch
    # 인프라가 healthy 가 된 뒤 서비스가 뜨도록 depends_on 이 걸려 있다. 서비스 헬스체크까지 기다린다
    "${COMPOSE[@]}" up -d --wait --wait-timeout 600
    wait_http
    echo "환경 준비 완료. FE: MEMBER_SERVICE_URL=http://localhost:18981 PRODUCT_SERVICE_URL=http://localhost:18982 ..."
}

cmd_down()   { ensure_docker; "${COMPOSE[@]}" down; }
cmd_reset()  { ensure_docker; "${COMPOSE[@]}" down -v; cmd_up; }
cmd_status() {
    ensure_docker
    "${COMPOSE[@]}" ps
    docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' $("${COMPOSE[@]}" ps -q)
}

case "${1:-}" in
    up) cmd_up ;;
    down) cmd_down ;;
    reset) cmd_reset ;;
    status) cmd_status ;;
    *) echo "사용법: env.sh up|down|reset|status" >&2; exit 2 ;;
esac
