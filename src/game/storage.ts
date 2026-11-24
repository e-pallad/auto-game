/** localStorage-backed settings and stats. Survives private mode failures gracefully. */
const KEY = 'floeline:v1';

export interface Settings {
  sound: boolean;
  hints: boolean;
  reducedMotion: boolean;
  seenHowTo: boolean;
}

export interface DailyRecord {
  number: number;
  moves: number;
  par: number;
  undos: number;
  restarts: number;
}

export interface SaveData {
  settings: Settings;
  daily: Record<string, DailyRecord>; // keyed by YYYY-MM-DD
  practiceWins: number;
}

function defaults(): SaveData {
  const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    settings: { sound: true, hints: true, reducedMotion: prefersReduced, seenHowTo: false },
    daily: {},
    practiceWins: 0,
  };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = defaults();
    return { ...base, ...d, settings: { ...base.settings, ...d.settings } };
  } catch {
    return defaults();
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / sandboxed iframe): play continues without persistence */
  }
}

export interface Stats {
  played: number;
  atPar: number;
  streak: number;
  bestStreak: number;
}

/** Streak = consecutive daily puzzles completed, ending today (or yesterday if today is unplayed). */
export function computeStats(daily: Record<string, DailyRecord>, todayNumber: number): Stats {
  const recs = Object.values(daily);
  const nums = new Set(recs.map((r) => r.number));
  const atPar = recs.filter((r) => r.moves <= r.par).length;
  let best = 0;
  let run = 0;
  let prev = Number.NEGATIVE_INFINITY;
  for (const n of [...nums].sort((a, b) => a - b)) {
    run = n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  let streak = 0;
  let n = nums.has(todayNumber) ? todayNumber : todayNumber - 1;
  while (nums.has(n)) {
    streak++;
    n--;
  }
  return { played: recs.length, atPar, streak, bestStreak: best };
}
