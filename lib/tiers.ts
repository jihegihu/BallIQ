// Single source of truth for Elo rating tiers.
//
// These thresholds and colours previously lived in three places that had
// drifted apart — EloSheet painted "Intermediate" yellow while the profile
// page and onboarding painted it slate grey, and two of the three used the
// dark theme's grey (#94A3B8) as literal text, which falls under 3:1 contrast
// on a white card. One table, one colour per tier, clamped per theme.

import { legibleOn } from './contrast';

export type Tier = {
  label: string;
  /** Inclusive lower bound. */
  min: number;
  /** Brand hex for the tier, before any per-theme contrast clamping. */
  hex: string;
};

// Ordered high → low so a simple find() picks the right tier.
export const TIERS: Tier[] = [
  { label: 'Elite',        min: 2000, hex: '#EF4444' },  // red-500
  { label: 'Expert',       min: 1600, hex: '#F97316' },  // orange-500
  { label: 'Advanced',     min: 1200, hex: '#A78BFA' },  // violet-400
  { label: 'Intermediate', min: 800,  hex: '#EAB308' },  // yellow-500
  { label: 'Rookie',       min: 0,    hex: '#64748B' },  // slate-500
];

/** Human-readable range, e.g. "1600–2000" or "2000+". */
export function tierRange(i: number): string {
  const t = TIERS[i];
  const above = TIERS[i - 1];
  return above ? `${t.min}–${above.min}` : `${t.min}+`;
}

export function tierFor(elo: number): Tier {
  return TIERS.find((t) => elo >= t.min) ?? TIERS[TIERS.length - 1];
}

/** Tier label plus a colour guaranteed legible on the active theme's card. */
export function tierStyle(elo: number, theme: 'dark' | 'light'): { label: string; color: string } {
  const t = tierFor(elo);
  return { label: t.label, color: legibleOn(t.hex, theme) };
}
