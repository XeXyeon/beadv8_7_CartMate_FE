import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv, resolveBaseUrl } from './e2e/support/config.mjs';

// E2E 설정. 대상은 운영 환경(배포 FE · BE)이고 개발 서버는 띄우지 않는다. 자세한 규칙은 .env.e2e.example 참고.
//   npm run e2e         일반 실행(실패한 테스트만 영상 · trace)
//   npm run e2e:demo    시연 영상(흐름마다 영상, 동작 사이 간격)
loadE2eEnv();
const { origin } = resolveBaseUrl(); // 허용 주소 목록 밖이면 여기서 멈춘다
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
