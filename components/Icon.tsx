'use client';

// One authored icon set, one stroke weight, one grid.
//
// This replaces 29 distinct emoji and unicode glyphs (🔥 🏆 🎯 ▲ ▼ ✓ › →) that
// were standing in for icons across 79 call sites. Emoji render differently on
// every platform, can't take the theme's colour, sit on their own baseline, and
// read as placeholder. Every glyph here is drawn on the same 24px grid with the
// same 1.75 stroke, inherits currentColor, and aligns to the text it sits beside.

type IconName =
  | 'chevronRight' | 'chevronLeft' | 'chevronDown'
  | 'arrowRight'
  | 'trendUp' | 'trendDown'
  | 'check' | 'close' | 'ban' | 'minus'
  | 'flame' | 'target' | 'trophy' | 'medal'
  | 'globe' | 'users' | 'barChart' | 'calendar'
  | 'moon' | 'sun' | 'diamond' | 'sparkle' | 'lock';

const PATHS: Record<IconName, React.ReactNode> = {
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronLeft:  <path d="m15 18-6-6 6-6" />,
  chevronDown:  <path d="m6 9 6 6 6-6" />,
  arrowRight:   <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  trendUp:      <><path d="M3 17 9 11l4 4 8-8" /><path d="M14 7h7v7" /></>,
  trendDown:    <><path d="M3 7 9 13l4-4 8 8" /><path d="M14 17h7v-7" /></>,
  check:        <path d="M20 6 9 17l-5-5" />,
  close:        <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  ban:          <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  minus:        <path d="M5 12h14" />,
  flame:        <path d="M12 2.5c2.5 3 4 5.2 4 7.5a4 4 0 0 1-8 0c0-1 .3-1.9.8-2.7C7 9 6 11 6 13.5a6 6 0 0 0 12 0C18 9 15.5 5.5 12 2.5Z" />,
  target:       <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  trophy:       <><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /><path d="M12 14v4" /><path d="M8.5 21h7" /><path d="M10 18h4l.6 3h-5.2Z" /></>,
  medal:        <><circle cx="12" cy="15" r="5.5" /><path d="M8.5 10 6 3h4l2 4" /><path d="M15.5 10 18 3h-4l-2 4" /></>,
  globe:        <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" /></>,
  users:        <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4" /><path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 20" /></>,
  barChart:     <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  calendar:     <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  moon:         <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  sun:          <><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.5 1.5" /><path d="m17.6 17.6 1.5 1.5" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.9 19.1 1.5-1.5" /><path d="m17.6 6.4 1.5-1.5" /></>,
  diamond:      <path d="M12 3 20.5 12 12 21 3.5 12 12 3Z" />,
  sparkle:      <><path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9 12 3.5Z" /><path d="M18.5 3v3" /><path d="M20 4.5h-3" /></>,
  lock:         <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
};

/** Icons that read better filled than stroked. */
const FILLED = new Set<IconName>(['diamond', 'sparkle', 'moon']);

export default function Icon({
  name,
  size = 16,
  className = '',
  strokeWidth = 1.75,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
