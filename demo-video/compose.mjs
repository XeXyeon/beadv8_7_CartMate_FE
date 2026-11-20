// 녹화(work/scene-*.json의 webm · 문장 시작 시각)와 음성(work/audio/*.wav)을 합쳐 mp4 하나와 장면별 대본을 만든다.
//   npm run demo:compose        (DEMO_OUT으로 출력 폴더를 바꿀 수 있다. 기본 ~/Movies/cartmate-demo)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.env.DEMO_OUT ?? path.join(os.homedir(), 'Movies/cartmate-demo');
const WORK = path.join(OUT, 'work');
const SEG = path.join(WORK, 'seg');
mkdirSync(SEG, { recursive: true });

const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const scenes = readdirSync(WORK)
    .filter((f) => /^scene-\d+[a-z]?\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(WORK, f), 'utf8')));

const parts = [];
const script = [];
let clock = 0;
for (const scene of scenes) {
    const lines = [];
    const sceneStart = clock;
    scene.segments.forEach((seg, i) => {
        const vdur = probe(seg.video);
        const out = path.join(SEG, `s${String(scene.order).padStart(2, '0')}-${i}.mp4`);
        const args = ['-y', '-loglevel', 'error', '-i', seg.video];
        for (const b of seg.beats) args.push('-i', b.audio);
        let fc = '[0:v]fps=30,scale=1280:720,format=yuv420p[v];';
        if (seg.beats.length) {
            seg.beats.forEach((b, k) => (fc += `[${k + 1}:a]adelay=${Math.round(b.t * 1000)}:all=1[a${k}];`));
            fc += `${seg.beats.map((_, k) => `[a${k}]`).join('')}amix=inputs=${seg.beats.length}:normalize=0,apad=whole_dur=${vdur.toFixed(3)}[a]`;
        } else fc += `anullsrc=r=44100:cl=mono,atrim=0:${vdur.toFixed(3)}[a]`;
        args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '1', '-t', vdur.toFixed(3), out);
        execFileSync('ffmpeg', args, { stdio: 'inherit' });
        parts.push(out);
        for (const b of seg.beats) lines.push(`- \`${fmt(clock + b.t)}\` ${b.text}`);
        clock += probe(out);
    });
    script.push({ scene, start: sceneStart, end: clock, lines });
}

writeFileSync(path.join(WORK, 'concat.txt'), parts.map((p) => `file '${p}'`).join('\n'));
const mp4 = path.join(OUT, 'cartmate-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'concat.txt'), '-c', 'copy', '-movflags', '+faststart', mp4], { stdio: 'inherit' });

const md = [
    '# CartMate 시연 영상 대본',
    '',
    `총 길이 ${fmt(clock)} · 한국어 TTS(macOS Yuna) · 화면 아래 자막은 아래 문장과 같습니다.`,
    '',
    ...script.flatMap(({ scene, start, end, lines }) => [`## ${scene.order === 0 ? '인트로' : `장면 ${scene.order}`} · ${scene.title} (${scene.id}) — ${fmt(start)}~${fmt(end)}`, '', ...lines, '']),
];
writeFileSync(path.join(OUT, 'script.md'), md.join('\n'));
const size = Number(execFileSync('stat', ['-f', '%z', mp4], { encoding: 'utf8' }).trim());
console.log(`\n${mp4}\n길이 ${fmt(clock)} (${clock.toFixed(1)}초) · ${(size / 1048576).toFixed(1)}MB · 장면 ${scenes.length}개`);
