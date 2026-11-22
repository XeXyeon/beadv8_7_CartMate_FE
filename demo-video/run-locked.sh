#!/usr/bin/env bash
# 실행 잠금(/tmp/cartmate-e2e-run.lock)을 잡고 시연 영상 녹화 명령을 돌린다. 도커 환경 · 고정 계정 · FE 5173을 E2E와 함께 쓰므로 한 번에 한 세션만.
#   bash demo-video/run-locked.sh npx playwright test -c playwright.demo.config.ts -g "장면 0[0-4]"
L=/tmp/cartmate-e2e-run.lock
until mkdir "$L" 2>/dev/null; do
    o=$(awk '{print $2}' "$L/owner" 2>/dev/null); now=$(date +%s)
    if [ -n "$o" ] && [ $((now - o)) -gt 1800 ]; then rm -rf "$L"; continue; fi
    echo "잠금 대기 중($(cat "$L/owner" 2>/dev/null))…"; sleep 60
done
echo "QA-8 $(date +%s)" > "$L/owner"
trap 'rm -rf "$L"' EXIT
"$@"
