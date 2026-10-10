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
//
// Bands are deliberately TIGHT — roughly 150–250 Elo apart rather than the
// 400 they used to be. Everyone starts at 1200, and with K between 20 and 64
// a 400-point climb is a season-long grind: the next-tier bar sat near-empty
// for weeks, which reads as "I am getting nowhere" rather than "I am climbing".
// Legend is open-ended on top so strong players still have something to chase.
export const TIERS: Tier[] = [
  { label: 'Legend',       min: 1800, hex: '#F43F5E' },  // rose-500
  { label: 'Elite',        min: 1550, hex: '#EF4444' },  // red-500
  { label: 'Expert',       min: 1350, hex: '#F97316' },  // orange-500
  { label: 'Advanced',     min: 1150, hex: '#A78BFA' },  // violet-400 — the 1200 start lands here
  { label: 'Intermediate', min: 1000, hex: '#EAB308' },  // yellow-500
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

/**
 * Progress toward the next tier up. null once the top tier is reached.
 * Single implementation — EloSheet used to carry its own threshold table.
 */
export function nextTierProgress(elo: number): { label: string; toGo: number; percent: number } | null {
  // Ascending, so we can find the first band above the current rating.
  const asc = [...TIERS].reverse();
  const idx = asc.findIndex((t) => elo < t.min);
  if (idx === -1) return null;                 // already in the top tier
  const next  = asc[idx];
  const floor = asc[idx - 1]?.min ?? 0;
  return {
    label:   next.label,
    toGo:    next.min - elo,
    percent: Math.min(100, Math.max(0, Math.round(((elo - floor) / (next.min - floor)) * 100))),
  };
}
