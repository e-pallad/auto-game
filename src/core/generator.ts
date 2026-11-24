import { Rng, hashString } from './rng.ts';
import { type Dir, type Level, type Tile, parseLevel } from './rules.ts';
import { solve } from './solver.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GenParams {
  w: number;
  h: number;
  embers: number;
  rockMin: number;
  rockMax: number;
  waterMax: number;
  parMin: number;
  parMax: number;
  minStrandings: number;
  maxAttempts: number;
  maxNodes: number;
}

export const DIFFICULTY: Record<Difficulty, GenParams> = {
  easy: { w: 6, h: 6, embers: 2, rockMin: 4, rockMax: 7, waterMax: 2, parMin: 4, parMax: 7, minStrandings: 1, maxAttempts: 400, maxNodes: 20_000 },
  medium: { w: 7, h: 7, embers: 3, rockMin: 6, rockMax: 10, waterMax: 3, parMin: 7, parMax: 11, minStrandings: 3, maxAttempts: 600, maxNodes: 60_000 },
  hard: { w: 8, h: 8, embers: 4, rockMin: 8, rockMax: 13, waterMax: 4, parMin: 10, parMax: 15, minStrandings: 6, maxAttempts: 800, maxNodes: 150_000 },
};

export interface Puzzle {
  level: Level;
  par: number;
  solution: Dir[];
  seed: string;
  difficulty: Difficulty;
  attempts: number;
  fallback: boolean;
}

/** Handcrafted fallback; guaranteed solvable (covered by unit tests). */
const FALLBACK = parseLevel([
  '#.....#',
  '.S..*..',
  '...#...',
  '*.....#',
  '..#....',
  '.....*.',
  '#..D..#',
]);

export function candidate(rng: Rng, p: GenParams): Level {
  const n = p.w * p.h;
  const tiles: Tile[] = new Array<Tile>(n).fill('ice');
  const cells = rng.shuffle([...Array(n).keys()]);
  let i = 0;
  const rocks = p.rockMin + rng.int(p.rockMax - p.rockMin + 1);
  for (let r = 0; r < rocks; r++) tiles[cells[i++]!] = 'rock';
  const water = rng.int(p.waterMax + 1);
  for (let r = 0; r < water; r++) tiles[cells[i++]!] = 'water';
  const dock = cells[i++]!;
  tiles[dock] = 'dock';
  const start = cells[i++]!;
  const embers: number[] = [];
  for (let e = 0; e < p.embers; e++) embers.push(cells[i++]!);
  return { w: p.w, h: p.h, tiles, start, embers };
}

function collinear(level: Level): boolean {
  const xs = new Set(level.embers.map((c) => c % level.w));
  const ys = new Set(level.embers.map((c) => Math.floor(c / level.w)));
  return xs.size === 1 || ys.size === 1;
}

export function generate(seed: string, difficulty: Difficulty = 'medium'): Puzzle {
  const p = DIFFICULTY[difficulty];
  const rng = new Rng(hashString(`${difficulty}:${seed}`));
  let best: { level: Level; solution: Dir[]; score: number } | null = null;
  for (let attempt = 1; attempt <= p.maxAttempts; attempt++) {
    const level = candidate(rng, p);
    if (collinear(level)) continue;
    const r = solve(level, undefined, p.maxNodes);
    if (!r.solution) continue;
    const par = r.solution.length;
    if (par >= p.parMin && par <= p.parMax && r.strandings >= p.minStrandings) {
      return { level, par, solution: r.solution, seed, difficulty, attempts: attempt, fallback: false };
    }
    // Remember the closest solvable board in case nothing fits the band.
    const dist = par < p.parMin ? p.parMin - par : Math.max(0, par - p.parMax);
    const score = dist * 10 + Math.max(0, p.minStrandings - r.strandings);
    if (!best || score < best.score) best = { level, solution: r.solution, score };
  }
  if (best) {
    return { level: best.level, par: best.solution.length, solution: best.solution, seed, difficulty, attempts: p.maxAttempts, fallback: false };
  }
  const r = solve(FALLBACK);
  return { level: FALLBACK, par: r.solution!.length, solution: r.solution!, seed, difficulty, attempts: p.maxAttempts, fallback: true };
}

export { FALLBACK as FALLBACK_LEVEL };
