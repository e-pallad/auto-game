/**
 * Floeline rules. Pure functions, no DOM.
 *
 * - The player slides in a direction until the next cell is rock, water
 *   (including melted floes) or off the board. Entering the dock stops the slide.
 * - Embers are collected when the player passes over or stops on them.
 * - When the player leaves the cell they were standing on, it melts into water
 *   (the dock never melts).
 * - Win: standing on the dock with every ember collected.
 * - Stranded: not won and no direction produces movement.
 */

export type Tile = 'ice' | 'rock' | 'water' | 'dock';
export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
export const MAX_CELLS = 64;

export interface Level {
  w: number;
  h: number;
  tiles: Tile[];
  start: number;
  /** Cell indices holding embers. */
  embers: number[];
}

export interface GameState {
  pos: number;
  /** Bitmask of embers still to collect (bit i = level.embers[i]). */
  embersLeft: number;
  /** Melted cells as a 64-bit mask split in two 32-bit halves. */
  meltLo: number;
  meltHi: number;
}

export interface MoveResult {
  state: GameState;
  /** Cells passed through, excluding the start cell, ending at the stop cell. */
  path: number[];
  collected: number[];
  melted: number | null;
}

export function dirDelta(dir: Dir): [number, number] {
  switch (dir) {
    case 'up':
      return [0, -1];
    case 'down':
      return [0, 1];
    case 'left':
      return [-1, 0];
    case 'right':
      return [1, 0];
  }
}

export function initialState(level: Level): GameState {
  if (level.w * level.h > MAX_CELLS) throw new Error('Board too large');
  return {
    pos: level.start,
    embersLeft: level.embers.length === 0 ? 0 : (2 ** level.embers.length - 1) >>> 0,
    meltLo: 0,
    meltHi: 0,
  };
}

export function isMelted(s: GameState, cell: number): boolean {
  return cell < 32 ? ((s.meltLo >>> cell) & 1) === 1 : ((s.meltHi >>> (cell - 32)) & 1) === 1;
}

function withMelted(s: GameState, cell: number): Pick<GameState, 'meltLo' | 'meltHi'> {
  return cell < 32
    ? { meltLo: (s.meltLo | (1 << cell)) >>> 0, meltHi: s.meltHi }
    : { meltLo: s.meltLo, meltHi: (s.meltHi | (1 << (cell - 32))) >>> 0 };
}

export function isBlocked(level: Level, s: GameState, cell: number): boolean {
  const t = level.tiles[cell];
  return t === 'rock' || t === 'water' || isMelted(s, cell);
}

export function emberIndexAt(level: Level, cell: number): number {
  return level.embers.indexOf(cell);
}

export function move(level: Level, s: GameState, dir: Dir): MoveResult | null {
  const [dx, dy] = dirDelta(dir);
  let x = s.pos % level.w;
  let y = Math.floor(s.pos / level.w);
  const path: number[] = [];
  const collected: number[] = [];
  let embersLeft = s.embersLeft;
  for (;;) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) break;
    const cell = ny * level.w + nx;
    if (isBlocked(level, s, cell)) break;
    x = nx;
    y = ny;
    path.push(cell);
    const e = emberIndexAt(level, cell);
    if (e >= 0 && (embersLeft >>> e) & 1) {
      embersLeft = (embersLeft & ~(1 << e)) >>> 0;
      collected.push(cell);
    }
    if (level.tiles[cell] === 'dock') break;
  }
  if (path.length === 0) return null;
  const meltCell = level.tiles[s.pos] === 'dock' ? null : s.pos;
  const melt = meltCell === null ? { meltLo: s.meltLo, meltHi: s.meltHi } : withMelted(s, meltCell);
  return {
    state: { pos: path[path.length - 1]!, embersLeft, ...melt },
    path,
    collected,
    melted: meltCell,
  };
}

export function isWon(level: Level, s: GameState): boolean {
  return s.embersLeft === 0 && level.tiles[s.pos] === 'dock';
}

export function legalDirs(level: Level, s: GameState): Dir[] {
  return DIRS.filter((d) => move(level, s, d) !== null);
}

export function isStranded(level: Level, s: GameState): boolean {
  return !isWon(level, s) && legalDirs(level, s).length === 0;
}

export function stateKey(s: GameState): string {
  return `${s.pos}|${s.embersLeft}|${s.meltLo}|${s.meltHi}`;
}

/** Parse an ASCII board. `#` rock, `~` water, `.` ice, `S` start, `D` dock, `*` ember. */
export function parseLevel(rows: string[]): Level {
  const h = rows.length;
  const w = rows[0]!.length;
  const tiles: Tile[] = [];
  const embers: number[] = [];
  let start = -1;
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Row ${y} has wrong width`);
    [...row].forEach((ch, x) => {
      const i = y * w + x;
      switch (ch) {
        case '#':
          tiles.push('rock');
          break;
        case '~':
          tiles.push('water');
          break;
        case 'D':
          tiles.push('dock');
          break;
        case 'S':
          start = i;
          tiles.push('ice');
          break;
        case '*':
          embers.push(i);
          tiles.push('ice');
          break;
        case '.':
          tiles.push('ice');
          break;
        default:
          throw new Error(`Unknown tile '${ch}'`);
      }
    });
  });
  if (start < 0) throw new Error('No start');
  return { w, h, tiles, start, embers };
}
