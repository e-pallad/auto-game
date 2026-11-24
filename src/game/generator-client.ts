import { type Difficulty, type Puzzle, generate } from '../core/generator.ts';

export interface GenResult {
  puzzle: Puzzle;
  /** Time spent inside generate(), wherever it ran. */
  genMs: number;
  /** Request-to-result time seen by the caller (includes worker start-up and messaging). */
  roundTripMs: number;
  viaWorker: boolean;
}

/** Minimal surface of a Worker, so tests can supply a fake. */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(msg: unknown): void;
  terminate(): void;
}
export type WorkerFactory = () => WorkerLike;

type Pending = { resolve: (r: GenResult | null) => void; seed: string; difficulty: Difficulty; t0: number };
type Reply = { id: number; puzzle?: Puzzle; genMs?: number; error?: string };

function defaultFactory(): WorkerFactory | null {
  if (typeof Worker === 'undefined') return null;
  return () => new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/**
 * Runs puzzle generation in a Web Worker, one request at a time.
 *
 * - The worker starts eagerly. A new request (or cancel()) while another is still running terminates the busy worker,
 *   so the newest board isn't stuck behind an outdated one. The superseded request resolves
 *   to null, and a fresh worker is started for the next request.
 * - Falls back to main-thread generation if workers are unavailable or the worker fails to
 *   load or crashes (old browser, CSP, file:// URLs). Generation is deterministic, so both
 *   paths return the same puzzle for the same seed.
 */
export class GeneratorClient {
  private factory: WorkerFactory | null;
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  /** Counters for tests and benchmarks. */
  readonly stats = { spawned: 0, terminated: 0, cancelled: 0 };

  /** Pass null to force main-thread generation; omit to use a real Web Worker when available. */
  constructor(factory: WorkerFactory | null | undefined = undefined) {
    this.factory = factory === undefined ? defaultFactory() : factory;
    // Start the worker now so the first board doesn't wait for worker start-up.
    this.ensureWorker();
  }

  get usingWorker(): boolean {
    return this.factory !== null;
  }

  request(seed: string, difficulty: Difficulty): Promise<GenResult | null> {
    this.cancel();
    const t0 = performance.now();
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve(this.local(seed, difficulty, t0));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, seed, difficulty, t0 });
      worker.postMessage({ id, seed, difficulty });
    });
  }

  /** Abandon any in-flight request: its promise resolves to null and the busy worker is terminated. */
  cancel(): void {
    if (this.pending.size === 0) return;
    const outstanding = [...this.pending.values()];
    this.pending.clear();
    this.stats.cancelled += outstanding.length;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.stats.terminated++;
    }
    for (const p of outstanding) p.resolve(null);
  }

  private ensureWorker(): WorkerLike | null {
    if (this.worker || !this.factory) return this.worker;
    try {
      const w = this.factory();
      w.onmessage = (e: MessageEvent<Reply>) => {
        if (w === this.worker) this.onReply(e.data);
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        if (w === this.worker) this.disableWorker();
      };
      this.worker = w;
      this.stats.spawned++;
    } catch {
      this.factory = null;
    }
    return this.worker;
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

  /** Worker failed to load or crashed: finish outstanding requests locally and stop using workers. */
  private disableWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.factory = null;
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
