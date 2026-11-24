/**
 * Browser benchmark against the production build (served from a subpath like itch.io).
 * Usage: npm run build && npm run bench:browser [-- label]
 * Reports: bundle size, load timing, in-browser puzzle generation time (normal and 4x CPU
 * throttle as a rough low-end-phone proxy), draw() CPU cost per frame, JS heap.
 * Headless Chromium uses software rendering here, so numbers are relative, not absolute.
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
