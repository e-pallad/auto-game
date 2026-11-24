import { type Difficulty, type Puzzle, generate } from '../core/generator.ts';

export interface GenResult {
  puzzle: Puzzle;
  /** Time spent inside generate(), wherever it ran. */
  genMs: number;
  /** Request-to-result time seen by the caller (includes worker messaging). */
  roundTripMs: number;
  viaWorker: boolean;
}

type Pending = { resolve: (r: GenResult) => void; seed: string; difficulty: Difficulty; t0: number };
type Reply = { id: number; puzzle?: Puzzle; genMs?: number; error?: string };

/**
 * Runs puzzle generation in a Web Worker. Falls back to generating on the main thread if
 * workers are unavailable or the worker fails (old browser, blocked by CSP, file:// URLs).
 * Generation is deterministic, so both paths return the same puzzle for the same seed.
 */
export class GeneratorClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(useWorker = typeof Worker !== 'undefined') {
    if (!useWorker) return;
    try {
      this.worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<Reply>) => this.onReply(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.disableWorker();
      };
    } catch {
      this.worker = null;
    }
  }

  get usingWorker(): boolean {
    return this.worker !== null;
  }

  request(seed: string, difficulty: Difficulty): Promise<GenResult> {
    const t0 = performance.now();
    if (!this.worker) return Promise.resolve(this.local(seed, difficulty, t0));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, seed, difficulty, t0 });
      this.worker!.postMessage({ id, seed, difficulty });
    });
  }

  private onReply(r: Reply): void {
    const p = this.pending.get(r.id);
    if (!p) return;
    this.pending.delete(r.id);
    if (r.puzzle && r.genMs !== undefined) {
      p.resolve({ puzzle: r.puzzle, genMs: r.genMs, roundTripMs: performance.now() - p.t0, viaWorker: true });
    } else {
      p.resolve(this.local(p.seed, p.difficulty, p.t0));
    }
  }

  /** Worker failed to load or crashed: finish outstanding requests locally and stop using it. */
  private disableWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    const outstanding = [...this.pending.values()];
    this.pending.clear();
    for (const p of outstanding) p.resolve(this.local(p.seed, p.difficulty, p.t0));
  }

  private local(seed: string, difficulty: Difficulty, t0: number): GenResult {
    const g0 = performance.now();
    const puzzle = generate(seed, difficulty);
    const now = performance.now();
    return { puzzle, genMs: now - g0, roundTripMs: now - t0, viaWorker: false };
  }
}
