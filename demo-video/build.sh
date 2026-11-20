#!/usr/bin/env bash
# 시연 영상용 FE 운영 빌드. NEXT_PUBLIC_* 값(토스 클라이언트 키)은 빌드할 때 박히므로 .env.e2e를 읽어 와서 빌드한다.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.e2e ] && { set -a; . ./.env.e2e; set +a; }
MEMBER_SERVICE_URL=http://localhost:18981 PRODUCT_SERVICE_URL=http://localhost:18982 PAYMENT_SERVICE_URL=http://localhost:18983 \
ETC_SERVICE_URL=http://localhost:18984 ORDER_SERVICE_URL=http://localhost:18986 npx next build
