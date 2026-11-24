/**
 * Daily puzzle numbering. Uses the player's *local* calendar date (as Wordle does):
 * everyone on the same local date gets the same board.
 */
export const EPOCH = { y: 2026, m: 11, d: 24 }; // Puzzle #1

export interface DailyInfo {
  number: number;
  dateKey: string; // YYYY-MM-DD
  seed: string;
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailyInfo(date: Date): DailyInfo {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = Date.UTC(EPOCH.y, EPOCH.m - 1, EPOCH.d);
  const number = Math.floor((day - epoch) / 86_400_000) + 1;
  const key = dateKey(date);
  return { number, dateKey: key, seed: `daily-${key}` };
}
