import { DIRS, type Dir, type GameState, type Level, initialState, isWon } from './rules.ts';

export interface SolveResult {
  /** Shortest solution, or null if none found within limits. */
  solution: Dir[] | null;
  /** States expanded. */
  nodes: number;
  /** Reachable stranded states seen during the search (dead ends). */
  strandings: number;
  /** True if the node cap stopped the search early. */
  capped: boolean;
}

/**
 * Breadth-first search over (position, embers left, melted cells).
 * Melted cells are part of the key because they change which moves exist.
 *
 * Performance notes: states live in growable typed arrays and the visited set is an
 * open-addressing hash table over three int32 words, so the search allocates almost
 * nothing per node. Expansion order (FIFO, directions in DIRS order) matches the original
 * string-keyed solver exactly, so generated puzzles and pars are unchanged. Equivalence is
 * checked in tests/unit/solver.test.ts against tests/unit/reference-solver.ts.
 */
export function solve(level: Level, from: GameState = initialState(level), maxNodes = 200_000): SolveResult {
  if (isWon(level, from)) return { solution: [], nodes: 0, strandings: 0, capped: false };
  const { w, h, tiles } = level;
  const n = w * h;

  // Static lookup tables
  const blocked = new Uint8Array(n);
  const dock = new Uint8Array(n);
  const ember = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    blocked[i] = t === 'rock' || t === 'water' ? 1 : 0;
    dock[i] = t === 'dock' ? 1 : 0;
  }
  level.embers.forEach((c, i) => {
    if (ember[c] === -1) ember[c] = i;
  });
  // Neighbour per direction (DIRS order: up, right, down, left); -1 = off board
  const nb = new Int16Array(4 * n);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    nb[i] = y > 0 ? i - w : -1;
    nb[n + i] = x < w - 1 ? i + 1 : -1;
    nb[2 * n + i] = y < h - 1 ? i + w : -1;
    nb[3 * n + i] = x > 0 ? i - 1 : -1;
  }

  // Growable state store
  let cap = 1024;
  let sPE = new Int32Array(cap); // pos | embersLeft << 8
  let sLo = new Int32Array(cap);
  let sHi = new Int32Array(cap);
  let sParent = new Int32Array(cap);
  let sDir = new Uint8Array(cap);
  let count = 0;
  const grow = () => {
    cap *= 2;
    const g32 = (a: Int32Array) => {
      const b = new Int32Array(cap);
      b.set(a);
      return b;
    };
    sPE = g32(sPE);
    sLo = g32(sLo);
    sHi = g32(sHi);
    sParent = g32(sParent);
    const d = new Uint8Array(cap);
    d.set(sDir);
    sDir = d;
  };

  // Visited set: open addressing, stores state index + 1 (0 = empty)
  let tcap = 4096;
  let table = new Int32Array(tcap);
  const hash = (pe: number, lo: number, hi: number) =>
    (Math.imul(pe ^ Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi ^ (hi >>> 15), 0x85ebca6b), 0xc2b2ae35) >>> 0);
  const insert = (pe: number, lo: number, hi: number): boolean => {
    let mask = tcap - 1;
    let i = hash(pe, lo, hi) & mask;
    for (;;) {
      const v = table[i]!;
      if (v === 0) break;
      const s = v - 1;
      if (sPE[s] === pe && sLo[s] === lo && sHi[s] === hi) return false;
      i = (i + 1) & mask;
    }
    if (count >= cap) grow();
    sPE[count] = pe;
    sLo[count] = lo;
    sHi[count] = hi;
    table[i] = ++count;
    if (count * 2 > tcap) {
      tcap *= 2;
      table = new Int32Array(tcap);
      mask = tcap - 1;
      for (let s = 0; s < count; s++) {
        let j = hash(sPE[s]!, sLo[s]!, sHi[s]!) & mask;
        while (table[j] !== 0) j = (j + 1) & mask;
        table[j] = s + 1;
      }
    }
    return true;
  };

  insert(from.pos | (from.embersLeft << 8), from.meltLo | 0, from.meltHi | 0);
  sParent[0] = -1;
  let head = 0;
  let nodes = 0;
  let strandings = 0;

  while (head < count) {
    const cur = head++;
    nodes++;
    if (nodes > maxNodes) return { solution: null, nodes, strandings, capped: true };
    const pe = sPE[cur]!;
    const pos = pe & 0xff;
    const emb = pe >>> 8;
    const lo = sLo[cur]!;
    const hi = sHi[cur]!;
    let anyMove = false;
    for (let d = 0; d < 4; d++) {
      const off = d * n;
      let p = pos;
      let e = emb;
      for (;;) {
        const q = nb[off + p]!;
        if (q < 0 || blocked[q] || (q < 32 ? (lo >>> q) & 1 : (hi >>> (q - 32)) & 1)) break;
        p = q;
        const ei = ember[q]!;
        if (ei >= 0) e &= ~(1 << ei);
        if (dock[q]) break;
      }
      if (p === pos) continue;
      anyMove = true;
      let nlo = lo;
      let nhi = hi;
      if (!dock[pos]) {
        if (pos < 32) nlo = lo | (1 << pos);
        else nhi = hi | (1 << (pos - 32));
      }
      if (!insert(p | (e << 8), nlo, nhi)) continue;
      const idx = count - 1;
      sParent[idx] = cur;
      sDir[idx] = d;
      if (e === 0 && dock[p]) return { solution: rebuild(sParent, sDir, idx), nodes, strandings, capped: false };
    }
    if (!anyMove) strandings++;
  }
  return { solution: null, nodes, strandings, capped: false };
}

function rebuild(parent: Int32Array, dir: Uint8Array, idx: number): Dir[] {
  const out: Dir[] = [];
  for (let i = idx; parent[i]! >= 0; i = parent[i]!) out.push(DIRS[dir[i]!]!);
  return out.reverse();
}
