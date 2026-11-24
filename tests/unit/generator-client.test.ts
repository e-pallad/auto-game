import { describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator.ts';
import { GeneratorClient } from '../../src/game/generator-client.ts';

describe('GeneratorClient', () => {
  it('falls back to main-thread generation when workers are unavailable', async () => {
    const client = new GeneratorClient(false);
    expect(client.usingWorker).toBe(false);
    const r = await client.request('client-1', 'hard');
    expect(r.viaWorker).toBe(false);
    expect(r.puzzle).toEqual(generate('client-1', 'hard'));
    expect(r.roundTripMs).toBeGreaterThanOrEqual(r.genMs);
  });
  it('defaults to fallback in environments without Worker (Node)', () => {
    expect(new GeneratorClient().usingWorker).toBe(typeof Worker !== 'undefined');
  });
});
