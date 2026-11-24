# Floeline — marketing kit

Everything here describes the game that exists in this repository today. Nothing has been published, no accounts have been created and no money has been spent.

**Title:** Floeline
**Tagline:** *Every floe you stop on melts behind you.*

## Positioning

For players of daily puzzles who want a few minutes of *spatial* thinking instead of another word game, **Floeline** is a free browser puzzle with one new sliding-ice board each day. In Floeline, every place you stop melts once you leave it, so each move reshapes the board. Other games have breakable or melting ice, but this rule is unusual among the ones I found (see CONCEPT.md). A solver checks every daily board and sets its par. Your result is a spoiler-free line you can paste into a group chat.

- **Audience:** daily-puzzle players (Wordle/Connections habits, putt.day fans), people who like puzzle games on itch.io, and mobile browser players looking for a two-to-five-minute session.
- **What sets it apart:** the melting-stops rule combined with a daily board that is guaranteed solvable and has a computed par. Breakable and melting ice exist in other games (Frozen Path, Walking on Ice, Thin Ice), so the claim is "an unusual twist", not "first" (see [docs/CONCEPT.md](docs/CONCEPT.md)).

## Store page copy

**Short description (≤140 chars):**
A daily sliding-ice puzzle. Every floe you stop on melts behind you. Collect the embers, reach the dock, match the solver's par.

**Long description:**
> Dusk settles over a frozen lake. You carry a lantern, and the ice is thin.
>
> Push in any direction and you slide until a rock, open water or the edge of the lake stops you. The floe you stop on is cracked, and it melts the moment you leave it. Each move permanently changes the board: it gives you new places to stop and takes away routes you were counting on.
>
> Collect every ember, then reach the dock. A solver checks every board and works out its par, the fewest possible moves. Can you match it?
>
> Floeline gives everyone the same new puzzle each day, plus unlimited practice boards on Easy, Medium and Hard. Undo is unlimited, and when you finish, the share line shows your score without giving away the route.
>
> Free. Plays in your browser on desktop and mobile. No account, no ads, no tracking.

**Features:**
- 🧊 **Melting stops:** one rule that turns a familiar sliding puzzle into a planning puzzle.
- 📅 **A new board every day,** the same for everyone, with a solver-verified par.
- 🟦 **Spoiler-free share line** and a local streak counter.
- ♾️ **Unlimited practice** in three sizes (6×6, 7×7, 8×8).
- ↶ **Unlimited undo and restart,** so you can experiment.
- ⌨️ 📱 **Keyboard, swipe, tap or on-screen pad.** Reduced-motion mode, shapes that don't rely on colour, optional landing hints.
- 🪶 **Tiny download:** about 45 KB in total (about 17 KB gzipped). It loads instantly.

**Call to action:** *Play today's Floeline in your browser. It takes about three minutes, and your share line is waiting.*

Example share line, taken from the real game output in the e2e test:
```
Floeline #1 🧊 9/9 Par ⭐
🟦🟦🟦🟦🟦🟦🟦🟦🟦
1 undo
```

## Launch and discovery plan

| Step | Platform / action | Cost | Requirements | Assumptions |
|---|---|---|---|---|
| 1 | **itch.io HTML5 page.** Upload `release/floeline-web.zip` (built with `npm run package:itch`), choose "Embed in page" at about 720×900, turn on "Mobile Friendly", add the fullscreen button | $0. itch.io is free to use and the revenue share is set by the developer (https://itch.io/docs/creators/faq). HTML5 payments are **donations only** (https://itch.io/docs/creators/html5) | itch.io account; ZIP with `index.html` at the root, relative paths, ≤1,000 files and ≤500 MB (verified against the docs on 2026-11-24) | Assumes a free/pay-what-you-want model |
| 2 | **Tags and screenshots:** puzzle, daily, minimalist, ice, singleplayer, mobile friendly, short. Use the screenshot list below | $0 | — | Tags drive discovery inside itch.io; I have no data on how much |
| 3 | **Day-one posts:** r/WebGames, r/puzzles (check each subreddit's self-promotion rules first), and the itch.io devlog | $0 | Reddit account | Community rules change; read them before posting |
| 4 | **Share loop:** players paste the share line. Add a public URL to `shareText` (`src/core/share.ts`) once the game has a permanent address | $0 | Final URL | Every share then links back to the game |
| 5 | **Web portals** (CrazyGames, Poki) after itch.io feedback | $0 to submit | Each portal has its own SDK and requirements, which I have **not** researched | Portal acceptance is uncertain |
| 6 | **Optional own domain and static host** (e.g. GitHub Pages) so share links stay stable | ~$10–15/year for a domain (rough estimate, not verified) | Hosting account | Only worth it if there are repeat players |

**No-go for now:** a paid Steam release. The evidence in CONCEPT.md shows small cozy-puzzle games rarely get traction there. Steam also charges a per-app fee, which I did not re-verify. Revisit after measuring itch.io retention.

**What to measure after launch:** itch.io views → plays → comments, how many players return the next day (ask in the devlog), and how often share lines appear in posts.

## Screenshots and trailer

Screenshots captured automatically by `npm run test:e2e` (headless Chromium, 1100×820 desktop and 390×844 @2× mobile) are in [`docs/screenshots/`](docs/screenshots/):

| File | Shows | Store use |
|---|---|---|
| `midgame.png` | Daily #1 halfway through, with melted floes, landing hints and an ember | **Cover / hero** |
| `win.png` | "Ashore at par" with the share line | Second screenshot |
| `title.png` | Title menu with stats and settings | Third |
| `howto.png` | Rules dialog | Fourth |
| `stranded.png` | Lose state, captured as floes melt | Optional |
| `mobile-title.png`, `mobile-win.png` | Portrait mobile layout | Mobile proof |

**Still to capture by a human.** I can't record video or play audio in this environment.
1. **Trailer, 20–30 s, 1080p, with sound.**
   - Run `npm run preview` and open http://localhost:4173/?seed=trailer&d=medium in a Windows browser.
   - Record with Xbox Game Bar (Win+G) or OBS.
   - Shot list: (a) a 2 s title card; (b) three slides, with the camera lingering on a floe melting behind the player; (c) a caption, "Every floe you stop on melts"; (d) a deliberate stranding, then Undo; (e) the solve and the win chime; (f) the share line; (g) end card "Play free in your browser".
2. **A 630×500 itch.io cover image.** Crop `midgame.png` and add the title text.
3. **A 3–5 s GIF** of a single melt for social posts.
