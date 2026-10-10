'use client';

// Renders an Elo tier label in the colour that's legible on the active theme.
// Exists as a client component so SERVER pages (the public profile page) can
// still get theme-correct tier colours without becoming client components
// themselves.

import { useThemeStore } from '@/lib/themeStore';
import { tierStyle } from '@/lib/tiers';

type Props = {
  elo: number;
  className?: string;
  /** Prefix the label with the ◆ tier glyph used elsewhere in the app. */
  diamond?: boolean;
};

export default function TierLabel({ elo, className = '', diamond = false }: Props) {
  const theme = useThemeStore((s) => s.theme);
  const { label, color } = tierStyle(elo, theme);
  return (
    <span className={className} style={{ color }}>
      {diamond ? `◆ ${label}` : label}
    </span>
  );
}
