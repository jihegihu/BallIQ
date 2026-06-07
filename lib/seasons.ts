export type Season = { id: number; name: string; start: string; end: string };

export const SEASONS: Season[] = [
  { id: 1, name: 'Season 1', start: '2026-06-06', end: '2026-09-06' },
];

export function getCurrentSeason(): Season | null {
  const now = new Date();
  return SEASONS.find(
    (s) => new Date(s.start) <= now && new Date(s.end) >= now,
  ) ?? null;
}

export function getDaysRemaining(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000));
}
