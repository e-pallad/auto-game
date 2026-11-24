export interface ShareInput {
  number: number;
  moves: number;
  par: number;
  undos: number;
  restarts: number;
}

/** Spoiler-free share text: one square per move (blue up to par, orange beyond). */
export function shareText(r: ShareInput): string {
  const over = Math.max(0, r.moves - r.par);
  const blocks = '🟦'.repeat(Math.min(r.moves, r.par)) + '🟧'.repeat(over);
  const verdict = r.moves < r.par ? 'Under par?!' : r.moves === r.par ? 'Par ⭐' : `+${over}`;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const parts = [r.undos ? plural(r.undos, 'undo') : '', r.restarts ? plural(r.restarts, 'restart') : ''].filter(Boolean);
  const tail = parts.length ? parts.join(', ') : 'clean run';
  return `Floeline #${r.number} 🧊 ${r.moves}/${r.par} ${verdict}\n${blocks}\n${tail}`;
}
