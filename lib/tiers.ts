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
// Eleven tiers, arena-style: new accounts start at START_ELO (800) in the
// SECOND band, with one below it to fall into and nine above to climb.
//
// WHERE THESE NUMBERS COME FROM. They are not round numbers chosen by feel —
// they are pinned to what the rating engine can actually produce. lib/elo.ts
// is calibrated so a picker with no edge over the market sits at 1200, and
// simulation over 600 picks at veteran K puts genuine skill here:
//
//   no edge at all   ~1209      (and luck alone reaches ~1342 at the 95th %ile)
//   +4%  good amateur ~1342
//   +8%  semi-pro     ~1477
//   +12% exceptional  ~1618
//
// So the ladder splits into two halves that mean different things:
//
//   700 - 1160   the climb. Everyone makes this, because 800 starts below the
//                market's own level and the engine pays the gap. Bands are
//                narrow (80-100) so the early tiers fall every few picks.
//   1160 - 1700  earned. Veteran is the band that contains the no-edge
//                equilibrium, so reaching it means "you match the market".
//                Every tier above it requires genuinely beating the market,
//                and the bands widen (100-120) as that gets harder.
//
// An earlier version of this table ran to Legend at 2050, which was reachable
// only because the engine then handed out a flat per-pick bonus that inflated
// every account regardless of skill. With that bonus removed (see the long
// comment in lib/elo.ts) nothing above ~1450 was attainable and the top five
// tiers were dead. These thresholds are what the corrected engine supports.
//
// Prospect is deliberately wider than the bands above it. Starting at 800 in
// the middle of a 700-900 band means losing your very first pick cannot demote
// you — with a 100-wide band the opening loss dropped a brand-new account
// straight into Rookie, which is a miserable first impression.
//
// Colour runs cool to warm and deliberately avoids emerald and red, which are
// already spoken for as win and loss.
export const TIERS: Tier[] = [
  { label: 'Legend',     min: 1700, hex: '#FCD34D' },  // amber-300 — gold, top of the ladder
  { label: 'All-Star',   min: 1580, hex: '#A78BFA' },  // violet-400
  { label: 'Elite',      min: 1480, hex: '#C084FC' },  // purple-400
  { label: 'Expert',     min: 1380, hex: '#F472B6' },  // pink-400
  { label: 'Sharp',      min: 1280, hex: '#FB923C' },  // orange-400
  { label: 'Veteran',    min: 1160, hex: '#FACC15' },  // yellow-400 — contains the market baseline
  { label: 'Specialist', min: 1080, hex: '#A3E635' },  // lime-400
  { label: 'Challenger', min: 1000, hex: '#2DD4BF' },  // teal-400
  { label: 'Contender',  min:  900, hex: '#22D3EE' },  // cyan-400
  { label: 'Prospect',   min:  700, hex: '#38BDF8' },  // sky-400 — the START band
  { label: 'Rookie',     min:    0, hex: '#64748B' },  // slate-500
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
