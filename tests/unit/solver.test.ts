import { describe, expect, it } from 'vitest';
import { dailyInfo } from '../../src/core/daily.ts';
import { DIFFICULTY, FALLBACK_LEVEL, generate } from '../../src/core/generator.ts';
import { Rng, hashString } from '../../src/core/rng.ts';
import { type Level, initialState, isWon, move, parseLevel } from '../../src/core/rules.ts';
import { solve } from '../../src/core/solver.ts';

function replay(level: Level, dirs: readonly string[]) {
  let s = initialState(level);
  for (const d of dirs) {
    const r = move(level, s, d as never);
    expect(r).not.toBeNull();
    s = r!.state;
  }
  return s;
}

describe('solver', () => {
  it('finds the shortest solution', () => {
    const lvl = parseLevel(['S...D']);
    expect(solve(lvl).solution).toEqual(['right']);
  });
  it('accounts for melted cells in its state', () => {
    // Without melting: left, right, down wins. With melting the start cell is gone after
    // the first move, so the board is unsolvable.
    const lvl = parseLevel(['*S#', '#D#']);
    expect(solve(lvl).solution).toBeNull();
    expect(solve(parseLevel(['*S#', '.D#'])).solution).toEqual(['left', 'down', 'right']);
  });
  it('reports unsolvable boards', () => {
    const lvl = parseLevel(['S#D']);
    expect(solve(lvl).solution).toBeNull();
  });
  it('fallback level is solvable', () => {
    const r = solve(FALLBACK_LEVEL);
    expect(r.solution).not.toBeNull();
    expect(isWon(FALLBACK_LEVEL, replay(FALLBACK_LEVEL, r.solution!))).toBe(true);
  });
});

describe('rng', () => {
  it('is deterministic', () => {
    const a = new Rng(hashString('x'));
    const b = new Rng(hashString('x'));
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
});

describe('daily', () => {
  it('numbers puzzles from the epoch by local date', () => {
    expect(dailyInfo(new Date(2026, 10, 24, 0, 1)).number).toBe(1);
    expect(dailyInfo(new Date(2026, 10, 24, 23, 59)).number).toBe(1);
    expect(dailyInfo(new Date(2026, 10, 25)).number).toBe(2);
    expect(dailyInfo(new Date(2027, 10, 24)).number).toBe(366);
    expect(dailyInfo(new Date(2026, 10, 24)).dateKey).toBe('2026-11-24');
  });
});

describe('generator', () => {
  it('is deterministic for a seed', () => {
    const a = generate('abc');
    const b = generate('abc');
    expect(a.level).toEqual(b.level);
    expect(a.par).toBe(b.par);
  });

  it('365 consecutive daily puzzles are solvable with par in band', () => {
    const band = DIFFICULTY.medium;
    for (let i = 0; i < 365; i++) {
      const info = dailyInfo(new Date(2026, 10, 24 + i));
      const p = generate(info.seed, 'medium');
      expect(p.fallback).toBe(false);
      expect(p.par).toBeGreaterThanOrEqual(band.parMin);
      expect(p.par).toBeLessThanOrEqual(band.parMax);
      expect(isWon(p.level, replay(p.level, p.solution))).toBe(true);
    }
  }, 120_000);

  it('practice difficulties produce solvable boards', () => {
    for (const d of ['easy', 'hard'] as const) {
      for (let i = 0; i < 40; i++) {
        const p = generate(`t${i}`, d);
        expect(isWon(p.level, replay(p.level, p.solution))).toBe(true);
        expect(p.par).toBeGreaterThanOrEqual(DIFFICULTY[d].parMin);
        expect(p.par).toBeLessThanOrEqual(DIFFICULTY[d].parMax);
      }
    }
  }, 120_000);
});

describe('optimised solver matches the reference solver', () => {
  it('gives identical results on random candidate boards for every difficulty', async () => {
    const { solveReference } = await import('./reference-solver.ts');
    const { candidate } = await import('../../src/core/generator.ts');
    let compared = 0;
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const p = DIFFICULTY[d];
      const rng = new Rng(hashString(`equiv-${d}`));
      const cap = Math.min(p.maxNodes, 30_000);
      for (let i = 0; i < 150; i++) {
        const lvl = candidate(rng, p);
        expect(solve(lvl, undefined, cap)).toEqual(solveReference(lvl, undefined, cap));
        compared++;
      }
    }
    expect(compared).toBe(450);
  }, 120_000);
});
