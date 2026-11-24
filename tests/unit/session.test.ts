import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/core/rules.ts';
import { Session } from '../../src/core/session.ts';
import { shareText } from '../../src/core/share.ts';

describe('Session', () => {
  const lvl = parseLevel(['S.*.', '...D', '##..']);
  it('tracks moves, undo and restart', () => {
    const s = new Session(lvl, 3);
    expect(s.tryMove('up')).toBeNull(); // illegal: off board
    expect(s.tryMove('right')).not.toBeNull();
    expect(s.moves).toBe(1);
    expect(s.embersCollected).toBe(1);
    expect(s.undo()).toBe(true);
    expect(s.moves).toBe(0);
    expect(s.embersCollected).toBe(0);
    expect(s.undos).toBe(1);
    expect(s.undo()).toBe(false);
    s.tryMove('down');
    s.restart();
    expect(s.moves).toBe(0);
    expect(s.restarts).toBe(1);
  });
  it('reaches won and blocks further moves', () => {
    const s = new Session(lvl, 2);
    s.tryMove('right'); // to (3,0) collecting ember
    s.tryMove('down'); // to dock (3,1)
    expect(s.status).toBe('won');
    expect(s.tryMove('left')).toBeNull();
  });
  it('detects stranded', () => {
    const s = new Session(parseLevel(['S.#', '##D']), 1);
    s.tryMove('right');
    expect(s.status).toBe('stranded');
    s.undo();
    expect(s.status).toBe('playing');
  });
});

describe('shareText', () => {
  it('formats a par result without spoilers', () => {
    const t = shareText({ number: 3, moves: 4, par: 4, undos: 0, restarts: 0 });
    expect(t).toBe('Floeline #3 🧊 4/4 Par ⭐\n🟦🟦🟦🟦\nclean run');
  });
  it('marks moves over par', () => {
    const t = shareText({ number: 9, moves: 6, par: 4, undos: 1, restarts: 1 });
    expect(t).toContain('6/4 +2');
    expect(t).toContain('🟦🟦🟦🟦🟧🟧');
    expect(t).toContain('1 undo, 1 restart');
  });
});
