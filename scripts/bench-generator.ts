/**
 * Benchmarks puzzle generation. Usage: npm run bench [-- days]
 * Generates N consecutive daily puzzles plus practice boards and reports timing,
 * par distribution and fallback count. Node timing; browsers on phones will be slower.
 */
import { dailyInfo } from '../src/core/daily.ts';
import { DIFFICULTY, type Difficulty, generate } from '../src/core/generator.ts';

const days = Number(process.argv[2] ?? 365);
function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return { min: s[0]!, p50: q(0.5), p95: q(0.95), max: s[s.length - 1]!, mean: s.reduce((a, b) => a + b, 0) / s.length };
}
const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ');

const out: Record<string, unknown> = {};
for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
  const times: number[] = [];
  const pars: number[] = [];
  let outOfBand = 0;
  let fallback = 0;
  const start = new Date(2026, 10, 24);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const seed = diff === 'medium' ? dailyInfo(d).seed : `practice-${i}`;
    const t0 = performance.now();
    const p = generate(seed, diff);
    times.push(performance.now() - t0);
    pars.push(p.par);
    const g = DIFFICULTY[diff];
    if (p.par < g.parMin || p.par > g.parMax) outOfBand++;
    if (p.fallback) fallback++;
  }
  out[diff] = { ms: stats(times), par: stats(pars), outOfBand, fallback };
  console.log(`${diff.padEnd(6)} n=${days} ms[${fmt(stats(times))}] par[${fmt(stats(pars))}] outOfBand=${outOfBand} fallback=${fallback}`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
