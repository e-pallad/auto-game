// Original string-keyed BFS solver (pre-optimisation), kept as a reference oracle for tests.
import { DIRS, type Dir, type GameState, type Level, initialState, isWon, move, stateKey } from '../../src/core/rules.ts';

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
 */
export function solveReference(level: Level, from: GameState = initialState(level), maxNodes = 200_000): SolveResult {
  if (isWon(level, from)) return { solution: [], nodes: 0, strandings: 0, capped: false };
  const parent = new Map<string, { prev: string; dir: Dir } | null>();
  const startKey = stateKey(from);
  parent.set(startKey, null);
  let frontier: { s: GameState; k: string }[] = [{ s: from, k: startKey }];
  let nodes = 0;
  let strandings = 0;
  while (frontier.length > 0) {
    const next: { s: GameState; k: string }[] = [];
    for (const { s, k } of frontier) {
      nodes++;
      if (nodes > maxNodes) return { solution: null, nodes, strandings, capped: true };
      let anyMove = false;
      for (const dir of DIRS) {
        const r = move(level, s, dir);
        if (!r) continue;
        anyMove = true;
        const nk = stateKey(r.state);
        if (parent.has(nk)) continue;
        parent.set(nk, { prev: k, dir });
        if (isWon(level, r.state)) {
          return { solution: rebuild(parent, nk), nodes, strandings, capped: false };
        }
        next.push({ s: r.state, k: nk });
      }
      if (!anyMove) strandings++;
    }
    frontier = next;
  }
  return { solution: null, nodes, strandings, capped: false };
}

function rebuild(parent: Map<string, { prev: string; dir: Dir } | null>, key: string): Dir[] {
  const dirs: Dir[] = [];
  let k: string | undefined = key;
  for (;;) {
    const p = parent.get(k!);
    if (!p) break;
    dirs.push(p.dir);
    k = p.prev;
  }
  return dirs.reverse();
}
