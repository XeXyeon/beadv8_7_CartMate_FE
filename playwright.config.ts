import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv, resolveBaseUrl } from './e2e/support/config.mjs';

// E2E 설정. 대상은 로컬 도커의 운영 동등 환경(npm run e2e:env:up)이고, FE는 아래 webServer가 5173에 띄운다. 로컬이 아닌 주소는 거절한다.
//   npm run e2e         일반 실행(실패한 테스트만 영상 · trace)
//   npm run e2e:demo    시연 영상(흐름마다 영상, 동작 사이 간격)
loadE2eEnv();
const { origin, port } = resolveBaseUrl(); // 로컬이 아니면 여기서 멈춘다
process.env.E2E_RUN_ID ??= new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const demo = process.env.E2E_DEMO === '1';

export default defineConfig({
    testDir: './e2e',
    outputDir: demo ? 'test-results/demo' : 'test-results/run',
    // 고정 계정을 함께 쓰므로 한 번에 하나씩 돌린다.
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: demo ? 120_000 : 60_000,
    expect: { timeout: 10_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: origin,
        viewport: { width: 1280, height: 720 },
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
        trace: demo ? 'off' : 'retain-on-failure',
        video: demo ? { mode: 'on', size: { width: 1280, height: 720 } } : 'retain-on-failure',
        launchOptions: { slowMo: demo ? 300 : 0 },
    },
    // FE는 로컬 BE 컨테이너(18981~18986)를 바라보게 띄운다. 이미 떠 있으면 그대로 쓴다.
    webServer: {
        command: `npx next dev -p ${port}`,
        url: origin,
        reuseExistingServer: true,
        timeout: 180_000,
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
        { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
        {
            name: 'chromium',
            dependencies: ['setup'],
            testMatch: /.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
        },
    ],
});
