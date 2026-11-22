import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv, resolveBaseUrl } from './e2e/support/config.mjs';

// 시연 영상 녹화 설정(QA-8). E2E(playwright.config.ts)와 따로 쓰며 `npm run e2e`는 demo-video/를 보지 않는다.
//   npm run demo:record            장면 전체 녹화(→ ~/Movies/cartmate-demo/work)
//   npm run demo:record -- -g "장면 05"   한 장면만
//   npm run demo:compose           녹화 + 음성을 합쳐 mp4 · 대본 만들기
// 대상은 로컬 도커 E2E 환경이고, FE는 운영 빌드(next start)를 5173에 띄운다(개발 서버는 첫 방문마다 느려 영상이 끊긴다).
loadE2eEnv();
const { origin, port } = resolveBaseUrl(); // 로컬이 아니면 여기서 멈춘다
process.env.E2E_RUN_ID ??= new Date().toISOString().replace(/\D/g, '').slice(0, 14);

export default defineConfig({
    testDir: '.',
    outputDir: 'test-results/demo-video',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 15 * 60_000,
    expect: { timeout: 20_000 },
    reporter: [['list']],
    use: {
        baseURL: origin,
        viewport: { width: 1280, height: 720 },
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
        launchOptions: { slowMo: Number(process.env.DEMO_SLOWMO ?? 160) },
    },
    webServer: {
        command: `npx next start -p ${port}`,
        url: origin,
        reuseExistingServer: true,
        timeout: 60_000,
        env: {
            ...(process.env as Record<string, string>),
            MEMBER_SERVICE_URL: 'http://localhost:18981',
            PRODUCT_SERVICE_URL: 'http://localhost:18982',
            PAYMENT_SERVICE_URL: 'http://localhost:18983',
            ETC_SERVICE_URL: 'http://localhost:18984',
            ORDER_SERVICE_URL: 'http://localhost:18986',
        },
    },
    projects: [
        { name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
        { name: 'demo', dependencies: ['setup'], testDir: './demo-video/scenes', testMatch: /.*\.demo\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    ],
});
