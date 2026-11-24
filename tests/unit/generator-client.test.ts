import { describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator.ts';
import { GeneratorClient, type WorkerLike } from '../../src/game/generator-client.ts';

/** Fake worker: records messages, replies only when told to. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: { id: number; seed: string; difficulty: 'easy' | 'medium' | 'hard' }[] = [];
  terminated = false;
  postMessage(msg: unknown): void {
    this.sent.push(msg as FakeWorker['sent'][number]);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Answer the n-th message the way the real worker would. */
  reply(n = 0): void {
    const m = this.sent[n]!;
    this.onmessage?.({ data: { id: m.id, puzzle: generate(m.seed, m.difficulty), genMs: 1 } } as MessageEvent);
  }
  fail(): void {
    this.onerror?.({ preventDefault() {} } as ErrorEvent);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new GeneratorClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
}

describe('GeneratorClient', () => {
  it('generates through the worker and reuses it while idle', async () => {
    const { client, workers } = setup();
    const p1 = client.request('a', 'easy');
    workers[0]!.reply(0);
    const r1 = await p1;
    expect(r1?.viaWorker).toBe(true);
    expect(r1?.puzzle).toEqual(generate('a', 'easy'));
    const p2 = client.request('b', 'easy');
    workers[0]!.reply(1);
    expect((await p2)?.puzzle).toEqual(generate('b', 'easy'));
    expect(workers).toHaveLength(1);
    expect(client.stats).toEqual({ spawned: 1, terminated: 0, cancelled: 0 });
  });

  it('terminates a busy worker when a request is superseded, and starts a fresh one', async () => {
    const { client, workers } = setup();
    const slow = client.request('slow', 'hard');
    const fast = client.request('fast', 'easy');
    expect(await slow).toBeNull();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    // A late reply from the terminated worker must be ignored.
    workers[0]!.reply(0);
    workers[1]!.reply(0);
    expect((await fast)?.puzzle).toEqual(generate('fast', 'easy'));
    expect(client.stats).toEqual({ spawned: 2, terminated: 1, cancelled: 1 });
  });

  it('cancel() stops in-flight work but is a no-op when idle', async () => {
    const { client, workers } = setup();
    client.cancel();
    expect(client.stats.terminated).toBe(0);
    const p = client.request('x', 'medium');
    client.cancel();
    expect(await p).toBeNull();
    expect(workers[0]!.terminated).toBe(true);
    // Next request spins up a new worker.
    const q = client.request('y', 'easy');
    workers[1]!.reply(0);
    expect((await q)?.viaWorker).toBe(true);
  });

  it('falls back to the main thread if the worker errors, and stays there', async () => {
    const { client, workers } = setup();
    const p = client.request('err', 'easy');
    workers[0]!.fail();
    const r = await p;
    expect(r?.viaWorker).toBe(false);
    expect(r?.puzzle).toEqual(generate('err', 'easy'));
    expect(client.usingWorker).toBe(false);
    expect((await client.request('after', 'easy'))?.viaWorker).toBe(false);
    expect(workers).toHaveLength(1);
  });

  it('uses the main thread when no worker factory is available', async () => {
    const client = new GeneratorClient(null);
    expect(client.usingWorker).toBe(false);
    const r = await client.request('client-1', 'hard');
    expect(r?.viaWorker).toBe(false);
    expect(r?.puzzle).toEqual(generate('client-1', 'hard'));
    expect(r!.roundTripMs).toBeGreaterThanOrEqual(r!.genMs);
  });

  it('defaults to main-thread generation in environments without Worker (Node)', () => {
    expect(new GeneratorClient().usingWorker).toBe(typeof Worker !== 'undefined');
  });
});
