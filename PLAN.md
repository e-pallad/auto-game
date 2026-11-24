# Floeline — project plan

The concept and validation record is in [docs/CONCEPT.md](docs/CONCEPT.md). The decision was **Go**: a daily ice-sliding puzzle in which each tile you stop on melts as soon as you leave it.

## Environment (inspected 2026-11-24)

- **OS:** WSL2, kernel 6.18.58.1-microsoft-standard-WSL2, Ubuntu 24.04.4. 16 cores, 15 GiB RAM, 908 GB free disk.
- **Runtimes:** Node 24.14.0, npm 11.9.0, Python 3.12.3 and gcc 13.3 are installed. Godot 4.7.2 is installed but has no export templates. Go, Rust, .NET, Java, cmake and ffmpeg are not installed. No system browser.
- **Display:** WSLg is present (`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`). The GPU is exposed as `/dev/dri` plus d3d12 libs. There is a PulseAudio RDP sink. I could not verify audio output: Claude cannot hear it.
- **Browser testing:** Playwright browser builds are cached in `~/.cache/ms-playwright`, including chromium v1248. The newest release, 1.65.1, wants v1255, which is not cached. Pinning `@playwright/test@1.64.1` makes it use the cached v1248 build, so no download was needed. Verified with a headless screenshot.
- **Network:** npm registry and web search both reachable.

## Chosen stack: TypeScript, HTML5 Canvas 2D, DOM menus, Vite

| Option | Verdict |
|---|---|
| **TS + Canvas + Vite (chosen)** | Builds and runs here with no system changes. Playwright can drive it headless with real key presses. The static build uploads to itch.io as a ZIP and plays in any Windows or mobile browser. Trade-offs: no engine editor, and visuals are drawn in code. |
| Godot 4.7.2 | Runs projects locally. Web and native export need templates that are not installed; downloading them is about 1 GB and outside the repo. Automated UI checks would be harder. Rejected because I could not produce a verified shareable build. |
| Phaser/Pixi | Adds a dependency the game doesn't need: a grid puzzle renders easily with plain Canvas 2D. |
| Python/pygame | Not installed. The browser can't deliver it, so it is a poor fit for itch.io or mobile. |

Dependencies, all dev-only, pinned exactly, `package-lock.json` kept in the repo: `typescript@7.0.2`, `vite@8.3.8`, `vitest@5.1.1`, `@playwright/test@1.64.1`, `@types/node@24.19.2`. There are no runtime dependencies.

## Milestones

| # | Milestone | Acceptance criteria | Depends on | Status |
|---|---|---|---|---|
| M0 | Environment, research, concept | CONCEPT.md written. Stack chosen. Headless browser verified | — | ✅ done |
| M1 | Core rules and solver | Pure `rules.ts`. BFS solver whose state includes the melted tiles. Unit tests for sliding, melting, the dock, embers, being stranded and undo | M0 | ✅ done |
| M2 | Seeded generator and daily seed | Deterministic PRNG. Puzzles numbered by local date. 365 consecutive dates all solvable with par in the target band. Generation time measured | M1 | ✅ done |
| M3 | Playable game | Canvas render, keyboard, swipe and on-screen controls, HUD, undo/restart, win and stranded states, title, How to Play, practice mode, share text, local stats | M2 | ✅ done |
| M4 | Polish and accessibility | Synthesized SFX with a mute toggle, reduced motion, high-contrast shapes, responsive layout, focusable buttons | M3 | ✅ done |
| M5 | Verification | Typecheck, unit and e2e tests pass. E2E plays the solver's solution with real key presses against the production build served from a subpath, then restarts. Screenshots saved | M3 | ✅ done |
| M6 | Benchmarks and improvement pass | Baseline vs after numbers recorded below | M5 | ✅ done |
| M7 | Docs, marketing, itch package | README, MARKETING.md, `npm run package:itch` zip | M5 | ✅ done |

## Progress log

- **M0:** Inspected the environment and researched the market. Concept chosen: Floeline (see CONCEPT.md). Considered and rejected Godot because there are no export templates.
- **M1/M2:** `src/core` holds the rules, BFS solver, generator, daily numbering, session and share text. Unit tests cover 365 consecutive dates: all solvable, all with par 7–11, none falling back to the handcrafted board.
- **M3/M4:** The game is playable, built with Canvas, DOM menus and WebAudio. E2E caught a real bug: rAF timestamps lagged `performance.now()`, which made animation progress negative and threw `TypeError`. Fixed by clamping progress and using a single clock. Polish pass after reviewing screenshots: share wording, practice button layout, stranded dialog layout, no hints after a win.
- **M5:** 32 unit tests and 9 e2e tests pass, and typecheck is clean. E2E runs against the production build served from the subpath `/play/floeline/`, which mirrors how itch.io hosts HTML5 games. It loads the build as a top-level page, not in an iframe, and uses real key presses, touch taps, mouse swipes and clicks. A final advisor review found three gaps: swipe and click input and Copy result had no test, and the result dialog focused a hidden button on practice wins and in the stranded state. All three were fixed and tested.
- **M6:** Baseline benchmark, then the improvement below.
- **M7:** README, MARKETING.md, LICENSE, and an itch ZIP of 14 KB with 5 files.

## Acceptance criteria scorecard (final run)

| Criterion | Result | Evidence |
|---|---|---|
| Complete loop: menu → play → win/lose → restart → menu | ✅ | e2e `daily…`, `practice…` |
| Daily puzzles deterministic across Node and browser | ✅ | e2e compares the browser solution with a Node `generate()` |
| 365 daily boards solvable, par in band | ✅ | `tests/unit/solver.test.ts` |
| Optimised solver identical to reference | ✅ | 450 random boards compared field-by-field |
| Persistence (results, stats, settings) | ✅ | e2e reloads |
| Mobile layout and touch pad | ✅ | e2e at 390×844, touch |
| Mouse swipe and click-beside-player input | ✅ | e2e `mouse swipe…` |
| Copy result (clipboard, plus the fallback when it's denied) | ✅ | e2e, with the clipboard read back |
| Dialog focus lands on a visible primary button | ✅ | e2e (win, practice win, stranded) |
| Windows browser can reach the WSL server | ✅ | `curl.exe http://localhost:4173/` from Windows → 200 |
| Real touch-screen swipe | ⚠️ not done | Only emulated mouse and touch; manual step 5 in the README |
| No console errors during play | ✅ | Every e2e test asserts zero `pageerror`/console errors |
| itch.io package (index.html at root, relative paths) | ✅ | `npm run package:itch` checks the ZIP listing |
| Audio audible | ⚠️ not verifiable | No way to listen from WSL |
| Human playtest / fun | ⚠️ not done | Needs real players |

## Benchmarks

I set the targets *after* the baseline run, when writing up the results. They are judgement calls about keeping a tap feeling responsive, not external standards.

| Target (applies to) | Baseline | After |
|---|---|---|
| Daily generation **max** under 100 ms at 4× throttle | ❌ 307 ms | ✅ 76 ms |
| Hard generation **max** under 1 s at 4× throttle | ❌ 2,544 ms | ✅ 561 ms |
| `draw()` **p95** under 2 ms | ✅ 0.2 ms | ✅ 0.3 ms |
| Gzipped bundle under 50 KB | ✅ 13.3 KB | ✅ 13.8 KB |

**Generator, Node 24, 365 seeds per difficulty** (`npm run bench`, raw output in `docs/benchmarks/generator-node-*.txt`). Values are ms.

| Difficulty | Before: mean / p95 / max | After: mean / p95 / max |
|---|---|---|
| Easy | 3.1 / 17.5 / 36.9 | 0.8 / 4.5 / 15.0 |
| Medium (daily) | 17.8 / 78.6 / 202.6 | 2.9 / 13.2 / 36.5 |
| Hard | 79.5 / 385.0 / 870.8 | 10.2 / 48.4 / 108.5 |

The par distributions are identical before and after: easy mean 6.0, medium 9.1, hard 12.1. No boards fell outside the par band and none used the fallback.

**Browser, headless Chromium 156, software rendering, 20 boards each** (`npm run bench:browser`, JSON in `docs/benchmarks/`).

| Metric | Baseline | After |
|---|---|---|
| Daily generation, mean / max (ms) | 22.1 / 76.7 | 7.8 / 24.2 |
| Hard generation, mean / max (ms) | 89.0 / 622 | 21.1 / 155 |
| Daily at 4× CPU throttle, mean / max (ms) | 80.5 / 307 | 26.7 / 76.4 |
| **Hard at 4× CPU throttle, mean / max (ms)** | **358 / 2,544** | **79.4 / 561** |
| `draw()` CPU per frame, avg / p95 (ms) | 0.13 / 0.2 | 0.15 / 0.3 |
| rAF frames per second while playing | 60.0 | 59.9 |
| Bundle (4 files), raw / gzip | 36.8 KB / 13.3 KB | 37.9 KB / 13.8 KB |
| Page load (navigation duration, local server) | 9.9 ms | 10.8 ms |
| Live JS heap after GC (hard board) | invalid* | 1.1 MB |

\*The baseline heap reading (159 MB) came from Chromium's quantized `performance.memory` without `--enable-precise-memory-info`. It is not a valid number and I have not compared it. Run-to-run variance on the throttled maxima is about ±20%: a second "after" run gave a Hard 4× max of 468 ms.

**Improvement pass.** The biggest problem was the main thread freezing for up to 2.5 s while generating a Hard board at 4× throttle, roughly what a low-end phone would see. I rewrote the BFS solver to use typed-array state storage and an open-addressing hash set, with no per-node strings or objects, and kept the exact expansion order. Hard generation became about 4.5× faster in the browser at 4× throttle on both mean and max, and about 7–8× faster in Node. Daily boards are unchanged: an equivalence test checks this against the original solver, which is kept in `tests/unit/reference-solver.ts`.

## Risks and remaining work

| Item | Status / next step |
|---|---|
| Hard boards can still block the main thread for about 0.5 s on slow devices | Next: move `generate()` into a Web Worker, or precompute daily boards |
| Puzzle quality has not been validated with humans | Run a playtest with 5–10 players. Tune `DIFFICULTY` (par band, `minStrandings`) |
| Timezone differences in daily puzzles | Documented; same approach as Wordle |
| Share line has no URL | Add one once a permanent URL exists (`src/core/share.ts`) |
| No formatter or linter configured | The strict TypeScript compiler is the static check. Prettier or ESLint can be added if wanted |
| Self-review scripts and pre-push hook | ✅ Added: `npm run review`, `review:branch` and `review:full`, plus `.githooks/pre-push` → `scripts/pre-push-check.sh`. Tested by staging a planted AWS-style key, `test.only`, `debugger`, `.env`, conflict markers and `console.log` in a scratch clone: all were caught. A real `git push` to a local bare remote ran the full suite. Branch-name and delete-only cases checked. shellcheck is not installed, so only `bash -n` was run |
| Not tested in Firefox or Safari | Run `npx playwright install firefox webkit` (a download) and add projects to the config |
