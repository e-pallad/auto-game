/// <reference lib="webworker" />
// Generates puzzles off the main thread so slow devices keep animating while a board is built.
import { type Difficulty, generate } from '../core/generator.ts';

export interface GenRequest {
  id: number;
  seed: string;
  difficulty: Difficulty;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<GenRequest>) => {
  const { id, seed, difficulty } = e.data;
  const t0 = performance.now();
  try {
    const puzzle = generate(seed, difficulty);
    scope.postMessage({ id, puzzle, genMs: performance.now() - t0 });
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
