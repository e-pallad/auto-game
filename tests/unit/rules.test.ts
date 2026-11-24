import { describe, expect, it } from 'vitest';
import { initialState, isMelted, isStranded, isWon, legalDirs, move, parseLevel } from '../../src/core/rules.ts';

const L = parseLevel([
  '.....',
  '.S..#',
  '.....',
  '~*..D',
  '.....',
]);

describe('sliding', () => {
  it('slides until blocked by rock', () => {
    const r = move(L, initialState(L), 'right')!;
    expect(r.state.pos).toBe(1 * 5 + 3); // stops before rock at x=4
    expect(r.path).toEqual([7, 8]);
  });
  it('slides until board edge', () => {
    const r = move(L, initialState(L), 'up')!;
    expect(r.state.pos).toBe(1);
  });
  it('returns null when no movement is possible', () => {
    const lvl = parseLevel(['#S#', '.#.']);
    expect(move(lvl, initialState(lvl), 'left')).toBeNull();
    expect(move(lvl, initialState(lvl), 'down')).toBeNull();
    expect(move(lvl, initialState(lvl), 'up')).toBeNull();
  });
  it('stops before water', () => {
    const lvl = parseLevel(['S..~.']);
    expect(move(lvl, initialState(lvl), 'right')!.state.pos).toBe(2);
  });
  it('stops on the dock even with ice beyond', () => {
    const lvl = parseLevel(['S.D..']);
    expect(move(lvl, initialState(lvl), 'right')!.state.pos).toBe(2);
  });
});

describe('melting', () => {
  it('melts the cell the player leaves', () => {
    const s0 = initialState(L);
    const r = move(L, s0, 'right')!;
    expect(r.melted).toBe(L.start);
    expect(isMelted(r.state, L.start)).toBe(true);
  });
  it('melted cells block later slides', () => {
    const lvl = parseLevel(['S...', '....']);
    let s = move(lvl, initialState(lvl), 'right')!.state; // at 3, cell 0 melted
    s = move(lvl, s, 'down')!.state; // at 7
    s = move(lvl, s, 'left')!.state; // at 4
    // cell 0 is melted, so sliding up from 4 is blocked immediately
    expect(move(lvl, s, 'up')).toBeNull();
  });
  it('handles cells in the upper 32-bit half', () => {
    const rows = ['........', '........', '........', '........', '.......S', '........', '........', '........'];
    const lvl = parseLevel(rows);
    const r = move(lvl, initialState(lvl), 'left')!;
    expect(r.melted).toBe(39);
    expect(isMelted(r.state, 39)).toBe(true);
    expect(isMelted(r.state, 7)).toBe(false);
  });
  it('the dock never melts', () => {
    const lvl = parseLevel(['S.D', '...']);
    const s = move(lvl, initialState(lvl), 'right')!.state;
    const r = move(lvl, s, 'down')!;
    expect(r.melted).toBeNull();
  });
});

describe('embers, win and stranded', () => {
  it('collects embers passed over', () => {
    const lvl = parseLevel(['S*.*D']);
    const r = move(lvl, initialState(lvl), 'right')!;
    expect(r.collected).toEqual([1, 3]);
    expect(r.state.embersLeft).toBe(0);
    expect(isWon(lvl, r.state)).toBe(true);
  });
  it('reaching the dock with embers left is not a win', () => {
    const lvl = parseLevel(['S.D', '*..']);
    const s = move(lvl, initialState(lvl), 'right')!.state;
    expect(isWon(lvl, s)).toBe(false);
  });
  it('detects stranded state', () => {
    const lvl = parseLevel(['S.#', '##D']);
    const s = move(lvl, initialState(lvl), 'right')!.state; // at 1, start melted
    expect(legalDirs(lvl, s)).toEqual([]);
    expect(isStranded(lvl, s)).toBe(true);
  });
  it('parser rejects bad input', () => {
    expect(() => parseLevel(['..', '.'])).toThrow();
    expect(() => parseLevel(['..'])).toThrow('No start');
    expect(() => parseLevel(['S?'])).toThrow();
  });
});
