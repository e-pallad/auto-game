/**
 * Browser benchmark against the production build (served from a subpath like itch.io).
 * Usage: npm run build && npm run bench:browser [-- label]
 * Reports: bundle size, load timing, in-browser puzzle generation time (normal and 4x CPU
 * throttle as a rough low-end-phone proxy), draw() CPU cost per frame, JS heap.
 * Headless Chromium uses software rendering here, so numbers are relative, not absolute.
 * genMs is measured where generation runs. Since boards are generated in a Web Worker, and
 * CDP CPU throttling does not appear to slow workers, genMsThrottle4x understates slow-device
 * generation time. maxFrameGapMsThrottle4x (main-thread responsiveness) is the metric to watch.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const label = process.argv[2] ?? 'run';
const PORT = 4318;
const BASE = `http://localhost:${PORT}/play/floeline/index.html`;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk('dist');
const bundle = {
  files: files.length,
  bytes: files.reduce((a, f) => a + statSync(f).size, 0),
  gzipBytes: files.reduce((a, f) => a + gzipSync(readFileSync(f)).length, 0),
};

const server = spawn('node', ['scripts/serve-dist.mjs', String(PORT)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const result: Record<string, unknown> = { label, date: new Date().toISOString(), bundle };
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  type FL = { __floeline: { genMs(): number; frameStats(): unknown; resetFrameStats(): void; solution(): string[] } };

  // Load timing (median of 5 cold-ish loads; same browser context, so the HTTP cache may help)
  const loads: number[] = [];
  for (let i = 0; i < 5; i++) {
    await page.goto(`${BASE}?debug=1&r=${i}`, { waitUntil: 'load' });
    loads.push(await page.evaluate(() => performance.getEntriesByType('navigation')[0]!.duration));
  }
  loads.sort((a, b) => a - b);
  result.loadMsMedian = loads[2];

  async function genTimes(throttle: number) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const out: Record<string, { max: number; mean: number; n: number }> = {};
    const cases: [string, string[]][] = [
      ['daily', Array.from({ length: 20 }, (_, i) => `date=2026-12-${String(i + 1).padStart(2, '0')}`)],
      ['hard', Array.from({ length: 20 }, (_, i) => `seed=bench${i}&d=hard`)],
    ];
    for (const [name, qs] of cases) {
      const ms: number[] = [];
      for (const q of qs) {
        await page.goto(`${BASE}?debug=1&${q}`);
        if (name === 'daily') {
          await page.evaluate(() => (document.querySelector('#btn-howto-close') as HTMLElement).click());
          await page.click('#btn-daily');
        }
        await page.waitForFunction(() => (window as unknown as FL).__floeline.solution().length > 0);
        ms.push(await page.evaluate(() => (window as unknown as FL).__floeline.genMs()));
      }
      out[name] = { max: Math.max(...ms), mean: ms.reduce((a, b) => a + b, 0) / ms.length, n: ms.length };
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return out;
  }
  result.genMs = await genTimes(1);
  result.genMsThrottle4x = await genTimes(4);

  // Main-thread blocking while a board loads: the largest gap between animation frames,
  // measured by an rAF monitor independent of the game, at 4x CPU throttle.
  {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const gaps: Record<string, number[]> = { medium: [], hard: [] };
    for (const diff of ['medium', 'hard'] as const) {
      for (let i = 0; i < 20; i++) {
        await page.goto(`${BASE}?debug=1&seed=warmup&d=easy`);
        await page.waitForFunction(() => (window as unknown as { __floeline: { ready(): boolean } }).__floeline.ready());
        await page.waitForTimeout(150);
        const gap = await page.evaluate(
          async ([seed, d]) => {
            const fl = (window as unknown as { __floeline: { ready(): boolean; startPractice(s: string, d: string): void } }).__floeline;
            let max = 0;
            let last = performance.now();
            let on = true;
            const tick = () => {
              const now = performance.now();
              max = Math.max(max, now - last);
              last = now;
              if (on) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            await new Promise((r) => setTimeout(r, 100));
            max = 0; // ignore warm-up frames
            fl.startPractice(seed!, d!);
            while (!fl.ready()) await new Promise((r) => setTimeout(r, 5));
            await new Promise((r) => setTimeout(r, 100));
            on = false;
            return max;
          },
          [`bench${i}`, diff],
        );
        gaps[diff]!.push(gap);
      }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const sum = (xs: number[]) => ({ max: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length });
    result.maxFrameGapMsThrottle4x = { medium: sum(gaps.medium!), hard: sum(gaps.hard!) };
  }

  // Frame cost while idle (ripples) and while playing through a solution.
  await page.goto(`${BASE}?debug=1&seed=frames&d=medium`);
  await page.evaluate(() => (window as unknown as FL).__floeline.resetFrameStats());
  await page.waitForTimeout(2000);
  result.idleFrame = await page.evaluate(() => (window as unknown as FL).__floeline.frameStats());
  await page.evaluate(() => (window as unknown as FL).__floeline.resetFrameStats());
  const sol = await page.evaluate(() => (window as unknown as FL).__floeline.solution());
  const key: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const t0 = Date.now();
  for (const d of sol) {
    await page.keyboard.press(key[d]!);
    await page.waitForTimeout(400);
  }
  const elapsed = (Date.now() - t0) / 1000;
  const fs = (await page.evaluate(() => (window as unknown as FL).__floeline.frameStats())) as { n: number };
  result.playFrame = { ...fs, framesPerSecond: fs.n / elapsed };
  // Live JS heap after forced GC on a fresh page with a hard board generated and played.
  const hp = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  await hp.goto(`${BASE}?debug=1&seed=bench3&d=hard`);
  await hp.waitForTimeout(1000);
  result.heapAfterGcMB = await hp.evaluate(() => {
    (globalThis as unknown as { gc?: () => void }).gc?.();
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? m.usedJSHeapSize / 1048576 : null;
  });
} finally {
  await browser.close();
  server.kill();
}
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync(`docs/benchmarks/${label}.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
