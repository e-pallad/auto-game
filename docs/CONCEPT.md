# Floeline — concept and validation record

Prepared 2026-11-24. Every web source below was accessed on that date. Unless a source is marked **read in full**, I worked from search-engine result summaries and did not read the page itself, so treat those claims as second-hand.

## One-sentence hook

**Each ice floe you stop on melts as soon as you leave it, so every move permanently reshapes the board.** On top of that, a solver checks that each day's puzzle can be solved and computes its par, and the result is shared as a spoiler-free score.

## Candidates compared

Scores run from 1 (poor) to 5 (strong). Each one is my judgement, informed by the environment check and the sources below.

| Concept | Audience and loop | Differentiation | Solo feasibility here | Release and marketing fit | Risk (5 = low) | Total |
|---|---|---|---|---|---|---|
| **A. Floeline**: daily ice-slide puzzle where stop tiles melt behind you, with a solver-computed par | 5. Daily-puzzle players and short-session browser players. Loop: read the board, plan, slide, beat par, share | 4. Ice sliding is common. The melting-stops rule and the solver-verified daily par are unusual | 5. Pure logic plus Canvas, no art pipeline, testable headless | 5. Free browser game on itch.io with a shareable result line | 4. The main risk is generation quality and speed, and that can be measured | **23** |
| B. Daily circuit-routing puzzle (draw one wire through every node) | 4 | 2. Very close to many existing "flow"/"one-line" games | 5 | 4 | 4 | 19 |
| C. Arena survivor-like mini roguelite | 4 | 1. Saturated genre | 3. Balance and content heavy | 3 | 2. Needs a lot of art and tuning | 13 |
| D. Cozy shelf-sorting game | 4. A current Steam trend (PC Gamer) | 2. Crowded | 2. Needs many object assets | 3 | 2 | 13 |

**Decision: build A (Floeline). Go.**

## Audience

Players of Wordle-style daily games who want a *spatial* puzzle that takes 2–5 minutes, and casual browser-puzzle players who play on itch.io, on desktop or mobile.

## Core loop

1. Open today's puzzle. Everyone on the same local calendar date gets the same board.
2. Slide the lantern-bearer across the ice. You keep sliding until a rock, open water or the board edge stops you. The dock also stops you.
3. Every tile you *stop* on melts when you leave it. That creates new water, which becomes new stopping points and also cuts off routes.
4. Collect every ember, then reach the dock. Undo and restart are always available. If no move is possible you are "stranded".
5. Compare your move count with the solver's par, then copy a spoiler-free share line. Your streak is stored locally.
6. Practice mode offers unlimited seeded boards at Easy, Medium or Hard.

## Comparable products

- Ice-slide puzzles are common in browsers. Examples: *Ice Slide* on CrazyGames/Playgama (about 1,000 levels; it has a daily leaderboard and rewards but, as far as I could tell, no shared daily board), *100 Ice Sliding Puzzles* by fraglab on itch.io, and *Ice Sliding Puzzle Game* by cott3r on itch.io. https://www.crazygames.com/game/ice-slide, https://playgama.com/game/ice-slide, https://fraglab.itch.io/100-ice-sliding-puzzles, https://cott3r.itch.io/ice-sliding-puzzle-game
- *putt.day* is a daily minigolf puzzle: one hole per day, scored by strokes against par, with share links, no sign-in and local streaks. It is the closest model for the daily, par and share format. It reportedly launched 2026-05-13 and was praised by PC Gamer. https://www.pcgamer.com/games/sports/my-new-daily-game-is-like-wordle-but-for-minigolf/, https://www.dexerto.com/gaming/this-addictive-browser-game-is-the-minigolf-version-of-wordle-3407294/
- Wordle-style daily puzzles in general: same board for everyone, spoiler-free emoji share lines. https://dinogame.gg/blog/rise-of-daily-web-puzzles/, https://www.pcgamer.com/uk/best-games-like-wordle/
- Melting the tiles you pass over is a known mechanic in other games. Floeline's version differs: only the tiles you *stop* on melt, and you slide rather than walk.
- I ran two more searches aimed at the mechanic itself: ice-slide puzzles where tiles melt, crack or break after you stop on them. I found close variants but no exact match:
  - *Frozen Path* (studioyo, itch.io) slides you until an obstacle "while creating ice trail behind you" and has breakable ice blocks. https://studioyo.itch.io/frozen-path
  - *Walking on Ice* (Steam) lists "breakable tiles". https://store.steampowered.com/app/4419360
  - *Thin Ice* (caioguedes, itch.io) breaks every ice tile with step-by-step movement. https://caioguedes.itch.io/thin-ice
  - *Ice Is Melt* is a jam game in which tiles melt near heat sources.

  **Conclusion:** breaking or changing ice is not new in itself. What is less common is the specific combination of melting only where you stop, a solver-verified daily board with par, and a share line. Marketing copy should claim "an unusual twist", not "first ever".

## Evidence

- An Outlook Respawn article from May 2026 reports that puzzle and hypercasual games dominate web-browser play, based on a 12-month study of 1.74 billion sessions. The methodology is not visible in the summary. https://respawn.outlookindia.com/gaming/gaming-news/hypercasual-and-puzzle-titles-dominate-99-of-web-browser-gaming
- The "cozy" Steam tag is growing fast, but cozy *puzzle* games rarely reach 1,000 reviews: 5.9% did, against 27.8% of farming sims. That is a warning against a paid Steam launch for a small puzzle game. https://www.steampageanalyzer.com/blog/cozy-games-steam-2026-niche-report, https://www.pcgamer.com/games/life-sim/the-cozy-game-boom-is-the-clearest-trend-on-steam-over-five-years-of-data
- itch.io HTML5 requirements (**read in full**): a ZIP with `index.html`; relative paths; at most 1,000 files and 500 MB extracted, 200 MB per file; a "Mobile Friendly" option; HTML5 games take payments **as donations only**. https://itch.io/docs/creators/html5. itch.io charges nothing to use and lets the developer choose the revenue share. I did not verify the default percentage. https://itch.io/docs/creators/faq
- Name check: one web search for "Floeline" found no game with that name. Close names exist: "FlowLine" (a casual browser game) and "FLOE" (a board game). **This is not a trademark clearance.**

## Assumptions

- The daily-puzzle audience will try a new spatial format if the share line is good. This is an assumption, not validated with players.
- Sliding puzzles generated procedurally and verified by a solver can be interesting enough. This is mitigated by a par band and filtering on dead-end density. It still needs human playtesting, which I cannot do here.
- Local-date seeding is acceptable. Wordle works the same way, so players in different timezones briefly see different puzzles.

## Risks

| Risk | Mitigation |
|---|---|
| Generated boards feel random or trivial | Accept only boards whose par is inside a band, that have enough dead ends, and whose embers are not all on one line. Unit tests cover hundreds of dates |
| Generation too slow on low-end phones | Benchmark it. Cap BFS nodes. Fixed seeds keep results deterministic |
| Differentiation too thin against existing ice-slide games | Lead every marketing line with the melting rule and the daily par |
| WSL cannot be playtested interactively by Claude | Playwright drives real keyboard input in headless Chromium. Manual checklist in the README |

## Go/no-go

**Go**, as a free browser game on itch.io. **No-go for now** on a paid Steam release: the evidence above shows small cozy-puzzle titles struggle there. Revisit that after real players have tried the game.
