import { describe, expect, it } from 'vitest';
import { type DailyRecord, computeStats } from '../../src/game/storage.ts';

const rec = (number: number, moves = 9, par = 9): DailyRecord => ({ number, moves, par, undos: 0, restarts: 0 });

describe('computeStats', () => {
  it('counts a streak ending today', () => {
    const s = computeStats({ a: rec(1), b: rec(2), c: rec(3, 12) }, 3);
    expect(s).toEqual({ played: 3, atPar: 2, streak: 3, bestStreak: 3 });
  });
  it('keeps the streak alive when today is unplayed', () => {
    expect(computeStats({ a: rec(4), b: rec(5) }, 6).streak).toBe(2);
  });
  it('breaks the streak after a missed day', () => {
    const s = computeStats({ a: rec(1), b: rec(2), c: rec(3) }, 6);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(3);
  });
  it('handles no data', () => {
    expect(computeStats({}, 1)).toEqual({ played: 0, atPar: 0, streak: 0, bestStreak: 0 });
  });
});
