// Keeps brand colours legible against whichever theme is active.
//
// Team colours come straight from ESPN, so they range from #000000 (Brooklyn
// Nets, Juventus) to #ffffff (Fulham, Tottenham, Leeds). Used raw as text, 98
// of them fall below 3:1 contrast on a dark card and 44 do on a light one —
// i.e. invisible initials. These helpers nudge a colour toward the nearest
// legible shade while keeping its hue, so a team still reads as "itself".

const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance, 0 (black) → 1 (white). */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const v = (i: number) => srgb(parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * v(0) + 0.7152 * v(2) + 0.0722 * v(4);
}

/** WCAG contrast ratio between two luminances (1 → 21). */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mix(hex: string, toward: string, t: number): string {
  const a = hex.replace('#', '');
  const b = toward.replace('#', '');
  const ch = (i: number) => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

// Card backgrounds these colours actually sit on (see --c-card in globals.css).
const CARD_DARK  = '#0D1220';
const CARD_LIGHT = '#FFFFFF';
const MIN_RATIO  = 3.5;

/**
 * Nudge `hex` toward white (dark theme) or black (light theme) until it clears
 * MIN_RATIO against that theme's card. Returns the colour unchanged when it
 * already passes, which is the common case.
 */
export function legibleOn(hex: string, theme: 'dark' | 'light'): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const bg     = luminance(theme === 'light' ? CARD_LIGHT : CARD_DARK);
  const toward = theme === 'light' ? '#000000' : '#FFFFFF';

  let out = hex;
  // 12 steps of 12% reaches either extreme, so this always terminates.
  for (let i = 0; i < 12 && contrastRatio(luminance(out), bg) < MIN_RATIO; i++) {
    out = mix(out, toward, 0.12);
  }
  return out;
}
