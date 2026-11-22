import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// 시연 영상 녹화 도우미. E2E(e2e/)와 따로 돌며 `npm run e2e`에 섞이지 않는다(playwright.demo.config.ts).
// 장면은 "구간(segment)" 여럿으로 이뤄진다: 구간 하나 = 브라우저 컨텍스트 하나(계정 하나) = webm 하나.
// 구간 안에서 beat(문장, 동작)을 이어 부르면, 문장을 말하는 시간 동안 화면이 머물도록 맞추고 문장의 시작 시각을 기록한다.
// compose.mjs가 기록(work/*.json)과 webm · 음성을 합쳐 mp4를 만든다.

export const OUT_DIR = process.env.DEMO_OUT ?? path.join(os.homedir(), 'Movies/cartmate-demo');
export const WORK_DIR = path.join(OUT_DIR, 'work');
const AUDIO_DIR = path.join(WORK_DIR, 'audio');
const VOICE = process.env.DEMO_VOICE ?? 'Yuna';
const RATE = process.env.DEMO_RATE ?? '200';
const VIEWPORT = { width: 1280, height: 720 };

export type Beat = { t: number; audio: string; dur: number; text: string };
export type Segment = { video: string; beats: Beat[] };
export type SceneRecord = { order: number; id: string; title: string; segments: Segment[] };

/** 문장 → 음성 파일(캐시). say로 만들고 ffmpeg로 wav로 바꾼다. */
export function speech(text: string): { file: string; dur: number } {
    mkdirSync(AUDIO_DIR, { recursive: true });
    const key = createHash('sha1').update(`${VOICE}|${RATE}|${text}`).digest('hex').slice(0, 16);
    const wav = path.join(AUDIO_DIR, `${key}.wav`);
    if (!existsSync(wav)) {
        const aiff = path.join(AUDIO_DIR, `${key}.aiff`);
        execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, text]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', '-ac', '1', wav]);
    }
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).trim());
    return { file: wav, dur };
}

// 화면 위 덧씌움: 아래 자막, 왼쪽 위 장면 이름, 부드럽게 움직이는 마우스 포인터(Playwright 영상에는 포인터가 안 찍힌다).
const OVERLAY = `(() => {
  // 닫힌 shadow DOM 안에 그려서 화면 글자를 찾는 locator(getByText 등)에 자막이 걸리지 않게 한다.
  let host = null, shadow = null, title = null, cap = null, cur = null, ring = null;
  const mk = () => {
    if (host && host.isConnected) return;
    host = document.createElement('div'); host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = '<div style="position:fixed;inset:0;pointer-events:none;font-family:-apple-system,\\'Apple SD Gothic Neo\\',\\'Noto Sans KR\\',sans-serif">'
      + '<div id="t" style="position:absolute;left:14px;top:12px;background:rgba(17,24,39,.85);color:#fff;font-size:15px;font-weight:600;padding:7px 14px;border-radius:999px;display:none"></div>'
      + '<div id="c" style="position:absolute;left:50%;bottom:22px;transform:translateX(-50%);max-width:1040px;background:rgba(17,24,39,.86);color:#fff;font-size:22px;line-height:1.45;padding:10px 20px;border-radius:12px;text-align:center;display:none"></div>'
      + '<div id="u" style="position:absolute;left:-40px;top:-40px;width:22px;height:22px;margin:-4px 0 0 -4px;transition:left .35s ease,top .35s ease"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 3-8 8-3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>'
      + '<div id="r" style="position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid rgba(37,99,235,.9);opacity:0"></div></div>';
    title = shadow.getElementById('t'); cap = shadow.getElementById('c'); cur = shadow.getElementById('u'); ring = shadow.getElementById('r');
    (document.body || document.documentElement).appendChild(host);
    render();
  };
  const get = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return window['__' + k] || ''; } };
  const render = () => {
    if (!title || !cap) return;
    const tv = get('demoTitle'), cv = get('demoCap');
    const age = Date.now() - Number(get('demoT0') || 0);
    title.textContent = tv; title.style.display = tv && age < 4000 ? 'block' : 'none';
    if (tv && age < 4000) setTimeout(render, 4100 - age);
    cap.textContent = cv; cap.style.display = cv ? 'block' : 'none';
  };
  window.__demoRender = render;
  document.addEventListener('mousemove', (e) => {
    if (!cur) return; cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px';
    ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
  }, true);
  document.addEventListener('mousedown', () => { if (!ring) return; ring.style.transition = 'none'; ring.style.opacity = '1'; requestAnimationFrame(() => { ring.style.transition = 'opacity .5s ease'; ring.style.opacity = '0'; }); }, true);
  const boot = () => { mk(); new MutationObserver(mk).observe(document.documentElement, { childList: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();`;

// 아이콘 글꼴(Google Material Symbols)은 외부에서 받아 오는데, 컨텍스트마다 새로 받으면 아이콘이 영어 글자로 번쩍인다. 한 번 받은 응답을 메모리에 두고 재사용한다.
type Cached = { status: number; headers: Record<string, string>; body: Buffer };
const fontCache = new Map<string, Cached>();
let fontsWarm = false;
async function routeFonts(context: BrowserContext) {
    await context.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
        const url = route.request().url();
        let hit = fontCache.get(url);
        if (!hit) {
            const r = await route.fetch();
            hit = { status: r.status(), headers: r.headers(), body: await r.body() };
            fontCache.set(url, hit);
        }
        await route.fulfill(hit);
    });
}
async function warmFonts(browser: Browser, baseURL: string) {
    if (fontsWarm) return;
    fontsWarm = true;
    const context = await browser.newContext({ baseURL, viewport: VIEWPORT });
    await routeFonts(context);
    const page = await context.newPage();
    await page.goto('/login');
    await page.waitForTimeout(3000);
    await context.close();
}

export type Narrator = {
    page: Page;
    context: BrowserContext;
    /** 문장을 말하며 동작을 한다. 동작이 문장보다 짧으면 문장이 끝날 때까지 화면이 머문다. */
    beat: (text: string, action?: () => Promise<unknown>) => Promise<void>;
    /** 동작만(말 없이). */
    quiet: (action: () => Promise<unknown>) => Promise<void>;
    pause: (seconds: number) => Promise<void>;
    close: () => Promise<void>;
};

export class Scene {
    private segments: Segment[] = [];
    private opened: Narrator[] = [];
    constructor(
        readonly order: number,
        readonly id: string,
        readonly title: string,
        private browser: Browser,
        private baseURL: string,
        private suffix = '',
    ) {}

    /** 계정 하나로 구간을 연다. storageState가 없으면 비로그인. */
    async open(opts: { storageState?: string | { cookies: any[]; origins: any[] } } = {}): Promise<Narrator> { // eslint-disable-line @typescript-eslint/no-explicit-any
        mkdirSync(path.join(WORK_DIR, 'video'), { recursive: true });
        await warmFonts(this.browser, this.baseURL);
        const context = await this.browser.newContext({
            baseURL: this.baseURL,
            viewport: VIEWPORT,
            storageState: opts.storageState,
            recordVideo: { dir: path.join(WORK_DIR, 'video'), size: VIEWPORT },
        });
        await routeFonts(context);
        await context.addInitScript(OVERLAY);
        const page = await context.newPage();
        page.on('dialog', (d) => void d.accept());
        const t0 = Date.now();
        if (this.order === 0) {
            // 인트로는 홈페이지가 잠깐 비치지 않게 처음부터 카드와 같은 파란 배경으로 시작한다
            await page.setContent('<body style="margin:0;height:100vh;background:linear-gradient(135deg,#1e3a8a,#2563eb 55%,#60a5fa)">');
        } else {
            await page.goto('/'); // 첫 화면이 하얗게 비지 않게 홈을 먼저 보여 준다
        }
        const beats: Beat[] = [];
        const title = `${this.order === 0 ? '' : `장면 ${this.order} · `}${this.title}`;
        const setUi = async (cap: string) => {
            await page
                .evaluate(([t, c]) => {
                    try {
                        if (!sessionStorage.getItem('demoT0')) sessionStorage.setItem('demoT0', String(Date.now()));
                        sessionStorage.setItem('demoTitle', t);
                        sessionStorage.setItem('demoCap', c);
                    } catch {
                        (window as any).__demoTitle = t; // eslint-disable-line @typescript-eslint/no-explicit-any
                        (window as any).__demoT0 ||= String(Date.now()); // eslint-disable-line @typescript-eslint/no-explicit-any
                        (window as any).__demoCap = c; // eslint-disable-line @typescript-eslint/no-explicit-any
                    }
                    (window as any).__demoRender?.(); // eslint-disable-line @typescript-eslint/no-explicit-any
                }, [title, cap])
                .catch(() => {}); // 페이지 이동 중이면 다음 문장에서 다시 켠다
        };
        const beat: Narrator['beat'] = async (text, action) => {
            const { file, dur } = speech(text);
            const started = Date.now();
            await setUi(text);
            beats.push({ t: Math.max(0, (started - t0) / 1000), audio: file, dur, text });
            if (action) await action();
            // 동작 중 페이지가 바뀌었으면 자막을 다시 켠다
            await setUi(text);
            const left = dur + 0.5 - (Date.now() - started) / 1000;
            if (left > 0) await page.waitForTimeout(left * 1000);
        };
        const quiet: Narrator['quiet'] = async (action) => {
            await setUi('');
            await action();
        };
        const pause = (s: number) => page.waitForTimeout(s * 1000);
        let closed = false;
        const close = async () => {
            if (closed) return;
            closed = true;
            await setUi('');
            await page.waitForTimeout(400);
            const video = page.video();
            // 로그인 상태를 쓴 파일에 되돌려 저장한다(BE가 토큰을 돌려 쓰므로, 안 돌려 두면 다음 구간의 같은 파일 로그인이 무효가 된다)
            if (typeof opts.storageState === 'string') await context.storageState({ path: opts.storageState }).catch(() => {});
            await context.close();
            const videoPath = await video!.path();
            this.segments.push({ video: videoPath, beats });
        };
        const narrator = { page, context, beat, quiet, pause, close };
        this.opened.push(narrator);
        return narrator;
    }

    /** 열린 채 남은 구간을 닫고(실패했을 때) 기록을 저장한다. */
    async save() {
        for (const n of this.opened) await n.close().catch(() => {});
        mkdirSync(WORK_DIR, { recursive: true });
        const rec: SceneRecord = { order: this.order, id: this.id, title: this.title, segments: this.segments };
        writeFileSync(path.join(WORK_DIR, `scene-${String(this.order).padStart(2, '0')}${this.suffix}.json`), JSON.stringify(rec, null, 2));
    }
}

export function readWork<T>(name: string): T | null {
    const f = path.join(WORK_DIR, name);
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null;
}
export function writeWork(name: string, data: unknown) {
    mkdirSync(WORK_DIR, { recursive: true });
    writeFileSync(path.join(WORK_DIR, name), JSON.stringify(data, null, 2));
}
