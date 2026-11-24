import { type Page, expect, test } from '@playwright/test';
import { generate } from '../../src/core/generator.ts';
import { type Dir, type GameState, type Level, DIRS, initialState, isStranded, move } from '../../src/core/rules.ts';

const SHOTS = 'docs/screenshots';
const KEY: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function dbg<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((f) => (window as unknown as { __floeline: Record<string, () => unknown> }).__floeline[f]!(), fn) as Promise<T>;
}

/** Wait until the board for the current request has been generated (worker is async). */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __floeline: { ready(): boolean } }).__floeline.ready());
}

/** Depth-first search for a move sequence that ends stranded. */
function findStranding(level: Level, s: GameState = initialState(level), depth = 0): Dir[] | null {
  if (depth > 0 && isStranded(level, s)) return [];
  if (depth > 12) return null;
  for (const d of DIRS) {
    const r = move(level, s, d);
    if (!r) continue;
    const rest = findStranding(level, r.state, depth + 1);
    if (rest) return [d, ...rest];
  }
  return null;
}

test('first visit shows How to play, then the title menu', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('index.html?debug=1&date=2026-11-24');
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/howto.png` });
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { name: 'Floeline' })).toBeVisible();
  await expect(page.locator('#btn-daily')).toHaveText("Play today's puzzle #1");
  await page.screenshot({ path: `${SHOTS}/title.png` });
  expect(errors).toEqual([]);
});

test('daily: solve with real key presses, share, restart, persist', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('index.html?debug=1&date=2026-11-24');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('#btn-daily').click();
  await ready(page);
  await expect(page.locator('#hud-mode')).toHaveText('Daily #1');

  const solution = await dbg<Dir[]>(page, 'solution');
  const par = await dbg<number>(page, 'par');
  // The browser build and Node agree on the puzzle (determinism across runtimes).
  expect(solution).toEqual(generate('daily-2026-11-24', 'medium').solution);
  expect(solution.length).toBe(par);

  // An illegal-or-legal first move then undo, to exercise undo via keyboard.
  await page.keyboard.press(KEY[solution[0]!]);
  await expect(page.locator('#hud-moves')).toHaveText('1');
  await page.keyboard.press('z');
  await expect(page.locator('#hud-moves')).toHaveText('0');

  for (const [i, d] of solution.entries()) {
    await page.keyboard.press(KEY[d]);
    if (i === Math.floor(solution.length / 2)) {
      await page.waitForTimeout(700); // let the slide animation settle for a clean capture
      await page.screenshot({ path: `${SHOTS}/midgame.png` });
    }
  }
  await expect(page.locator('#hud-moves')).toHaveText(String(par));
  await expect(page.getByRole('heading', { name: /Ashore at par/ })).toBeVisible();
  const share = await page.locator('#result-share').textContent();
  expect(share).toContain(`Floeline #1 🧊 ${par}/${par} Par ⭐`);
  expect(share).toContain('\n1 undo');
  await page.screenshot({ path: `${SHOTS}/win.png` });

  // Restart from the result screen
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#hud-moves')).toHaveText('0');
  expect(await dbg<string>(page, 'status')).toBe('playing');

  // Reload: result persisted, stats updated
  await page.reload();
  await expect(page.locator('#btn-daily')).toHaveText("Replay today's #1");
  await expect(page.locator('#stats')).toContainText('1played');
  expect(errors).toEqual([]);
});

test('practice: getting stranded shows the lose state and undo recovers', async ({ page }) => {
  const errors = watchErrors(page);
  const seed = 'e2e-strand';
  const p = generate(seed, 'easy');
  const strand = findStranding(p.level);
  expect(strand, 'test board should allow a stranding').not.toBeNull();
  await page.goto(`index.html?debug=1&seed=${seed}&d=easy`);
  await ready(page);
  await expect(page.locator('#hud-mode')).toContainText('Practice · Easy');
  for (const d of strand!) await page.keyboard.press(KEY[d]);
  await expect(page.getByRole('heading', { name: 'Stranded' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/stranded.png` });
  await page.keyboard.press('z');
  await expect(page.getByRole('heading', { name: 'Stranded' })).toBeHidden();
  expect(await dbg<string>(page, 'status')).toBe('playing');
  // Solve from scratch via restart + solver line
  await page.keyboard.press('r');
  for (const d of p.solution) await page.keyboard.press(KEY[d]);
  await expect(page.getByRole('heading', { name: /Ashore/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New practice board' })).toBeVisible();
  await page.getByRole('button', { name: 'New practice board' }).click();
  await ready(page);
  await expect(page.locator('#hud-moves')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('mobile: on-screen pad solves a board', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const seed = 'mobile-1';
  await page.goto(`index.html?debug=1&seed=${seed}&d=easy`);
  await ready(page);
  const sol = generate(seed, 'easy').solution;
  for (const d of sol) await page.locator(`[data-dir="${d}"]`).tap();
  await expect(page.getByRole('heading', { name: /Ashore/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/mobile-win.png` });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.screenshot({ path: `${SHOTS}/mobile-title.png` });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('settings persist (sound off, reduce motion on)', async ({ page }) => {
  await page.goto('index.html?debug=1');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('checkbox', { name: 'Sound' }).uncheck();
  await page.getByRole('checkbox', { name: 'Reduce motion' }).check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Sound' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeChecked();
});

test('mouse swipe and click-beside-player move the player; result dialog focus', async ({ page }) => {
  const errors = watchErrors(page);
  const seed = 'pointer-1';
  const p = generate(seed, 'easy');
  await page.goto(`index.html?debug=1&seed=${seed}&d=easy`);
  await ready(page);
  const box = (await page.locator('#board').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const vec: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  // First move by drag (swipe), the rest alternate between drag and click-beside-player.
  for (const [i, d] of p.solution.entries()) {
    const [dx, dy] = vec[d];
    if (i % 2 === 0) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx * 80, cy + dy * 80, { steps: 4 });
      await page.mouse.up();
    } else {
      // Click well beyond the player in direction d: compute the player's on-screen cell.
      const pos = await page.evaluate(() => (window as unknown as { __floeline: { pos(): number } }).__floeline.pos());
      const cell = Math.min((box.width - 16) / p.level.w, (box.height - 16) / p.level.h);
      const ox = box.x + (box.width - cell * p.level.w) / 2;
      const oy = box.y + (box.height - cell * p.level.h) / 2;
      const px = ox + (pos % p.level.w) * cell + cell / 2;
      const py = oy + Math.floor(pos / p.level.w) * cell + cell / 2;
      await page.mouse.click(px + dx * cell * 1.5, py + dy * cell * 1.5);
    }
    await expect(page.locator('#hud-moves')).toHaveText(String(i + 1));
  }
  await expect(page.getByRole('heading', { name: /Ashore/ })).toBeVisible();
  // Copy result is hidden on practice wins, so focus must land on a visible button.
  await expect(page.locator('#btn-again')).toBeFocused();
  expect(errors).toEqual([]);
});

test('Copy result writes the share line to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('index.html?debug=1&date=2026-11-25');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('#btn-daily').click();
  await ready(page);
  for (const d of await dbg<Dir[]>(page, 'solution')) await page.keyboard.press(KEY[d]);
  await expect(page.locator('#btn-share')).toBeFocused();
  await page.locator('#btn-share').click();
  await expect(page.locator('#toast')).toHaveText('Result copied to clipboard');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^Floeline #2 🧊 \d+\/\d+ Par ⭐\n🟦+\nclean run$/u);
});

test('Copy result falls back to selecting the text when the clipboard API is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied (e.g. cross-origin iframe)')) },
    });
  });
  await page.goto('index.html?debug=1&date=2026-11-26');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('#btn-daily').click();
  await ready(page);
  for (const d of await dbg<Dir[]>(page, 'solution')) await page.keyboard.press(KEY[d]);
  await page.locator('#btn-share').click();
  await expect(page.locator('#toast')).toHaveText('Select and copy the text above');
  const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
  expect(selected).toContain('Floeline #3');
});

test('stranded dialog focuses Undo', async ({ page }) => {
  const seed = 'e2e-strand';
  const strand = findStranding(generate(seed, 'easy').level)!;
  await page.goto(`index.html?debug=1&seed=${seed}&d=easy`);
  await ready(page);
  for (const d of strand) await page.keyboard.press(KEY[d]);
  await expect(page.getByRole('heading', { name: 'Stranded' })).toBeVisible();
  await expect(page.locator('#btn-undo-result')).toBeFocused();
});

type Load = { viaWorker: boolean; genMs: number; roundTripMs: number } | null;

test('boards are generated in a Web Worker', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('index.html?debug=1&seed=worker-1&d=hard');
  await ready(page);
  expect(await dbg<boolean>(page, 'usingWorker')).toBe(true);
  const load = await dbg<Load>(page, 'lastLoad');
  expect(load?.viaWorker).toBe(true);
  // Same deterministic board as Node generates.
  expect(await dbg<Dir[]>(page, 'solution')).toEqual(generate('worker-1', 'hard').solution);
  expect(errors).toEqual([]);
});

test('falls back to main-thread generation when workers are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { Worker?: unknown }).Worker;
  });
  await page.goto('index.html?debug=1&seed=noworker-1&d=easy');
  await ready(page);
  expect(await dbg<boolean>(page, 'usingWorker')).toBe(false);
  expect((await dbg<Load>(page, 'lastLoad'))?.viaWorker).toBe(false);
  for (const d of generate('noworker-1', 'easy').solution) await page.keyboard.press(KEY[d]);
  await expect(page.getByRole('heading', { name: /Ashore/ })).toBeVisible();
});

test('falls back when the worker script fails to load', async ({ page }) => {
  await page.route('**/gen.worker*', (route) => route.abort());
  await page.goto('index.html?debug=1&seed=broken-worker&d=medium');
  await ready(page);
  expect((await dbg<Load>(page, 'lastLoad'))?.viaWorker).toBe(false);
  expect(await dbg<Dir[]>(page, 'solution')).toEqual(generate('broken-worker', 'medium').solution);
});

test('a newer request supersedes a slower one, and Menu cancels a load', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('index.html?debug=1');
  await page.getByRole('button', { name: 'Got it' }).click();
  type Fl = { __floeline: { startPractice(s: string, d: string): Promise<void> } };
  // Fire a hard request then an easy one immediately; the easy one must win even if hard resolves later.
  // Record every label the HUD ever shows, so a briefly-displayed stale board is caught.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    const el = document.getElementById('hud-mode')!;
    new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
    const fl = (window as unknown as Fl).__floeline;
    void fl.startPractice('slow-hard', 'hard');
    void fl.startPractice('fast-easy', 'easy');
  });
  await ready(page);
  await page.waitForTimeout(800);
  await expect(page.locator('#hud-mode')).toHaveText('Practice · Easy · fast-easy');
  expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual(['Practice · Easy · fast-easy']);
  expect(await dbg<Dir[]>(page, 'solution')).toEqual(generate('fast-easy', 'easy').solution);
  // The busy worker was terminated rather than left to finish the outdated board.
  type GenStats = { spawned: number; terminated: number; cancelled: number };
  expect(await dbg<GenStats>(page, 'genStats')).toEqual({ spawned: 2, terminated: 1, cancelled: 1 });

  // Start a load, then return to the menu before it completes: the title must stay.
  await page.evaluate(() => void (window as unknown as Fl).__floeline.startPractice('cancel-me', 'hard'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await expect(page.getByRole('heading', { name: 'Floeline' })).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  expect((await dbg<GenStats>(page, 'genStats')).terminated).toBe(2);

  // After a cancellation, a fresh worker serves the next board.
  await page.locator('#btn-daily').click();
  await ready(page);
  expect((await dbg<Load>(page, 'lastLoad'))?.viaWorker).toBe(true);
  expect(await dbg<GenStats>(page, 'genStats')).toEqual({ spawned: 3, terminated: 2, cancelled: 2 });
  expect(errors).toEqual([]);
});
