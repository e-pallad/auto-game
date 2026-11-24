import { type Dir, type GameState, type Level, type MoveResult, initialState, isStranded, isWon, move } from './rules.ts';

export type Status = 'playing' | 'won' | 'stranded';

/** One play-through of a level: history for undo, counters for scoring. */
export class Session {
  readonly level: Level;
  readonly par: number;
  private history: GameState[] = [];
  state: GameState;
  /** Moves currently on the board (undo removes one). This is the score. */
  get moves(): number {
    return this.history.length;
  }
  undos = 0;
  restarts = 0;
  lastMove: MoveResult | null = null;

  constructor(level: Level, par: number) {
    this.level = level;
    this.par = par;
    this.state = initialState(level);
  }

  get status(): Status {
    if (isWon(this.level, this.state)) return 'won';
    if (isStranded(this.level, this.state)) return 'stranded';
    return 'playing';
  }

  get embersTotal(): number {
    return this.level.embers.length;
  }

  get embersCollected(): number {
    let n = 0;
    for (let i = 0; i < this.level.embers.length; i++) if (!((this.state.embersLeft >>> i) & 1)) n++;
    return n;
  }

  /** Apply a move. Returns the result, or null if illegal or the game is over. */
  tryMove(dir: Dir): MoveResult | null {
    if (this.status !== 'playing') return null;
    const r = move(this.level, this.state, dir);
    if (!r) return null;
    this.history.push(this.state);
    this.state = r.state;
    this.lastMove = r;
    return r;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.state = prev;
    this.undos++;
    this.lastMove = null;
    return true;
  }

  restart(): void {
    if (this.history.length === 0) return;
    this.history = [];
    this.state = initialState(this.level);
    this.restarts++;
    this.lastMove = null;
  }
}
