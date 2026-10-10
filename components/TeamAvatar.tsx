'use client';

import { useState } from 'react';
import { getTeamInfo } from '@/lib/teamLogos';
import { legibleOn } from '@/lib/contrast';
import { useThemeStore } from '@/lib/themeStore';

interface Props {
  teamName: string;
  size?: 'xs' | 'sm' | 'md';
}

// Was 24 / 32 / 40px. `sm` and `md` (match detail page, bet sheet) get the
// full ~2x — there's room there and the logo is the hero.
//
// `xs` is the dense games list, where every pixel of avatar is a pixel of
// card height: it stays modest at 1.33x so the board keeps its original
// compact rhythm.
const DIM: Record<NonNullable<Props['size']>, string> = {
  xs: 'w-8 h-8',        // 32px
  sm: 'w-16 h-16',      // 64px
  md: 'w-20 h-20',      // 80px
};

const ABBR_TEXT: Record<NonNullable<Props['size']>, string> = {
  xs: 'text-[9px]',
  sm: 'text-sm',
  md: 'text-base',
};

export default function TeamAvatar({ teamName, size = 'sm' }: Props) {
  const { color, abbr, logo } = getTeamInfo(teamName);
  const [imgError, setImgError] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  // Real logo: rendered bare — no circle, no border, no tinted plate. Club
  // marks are designed to sit on their own; boxing them in a coloured disc
  // shrinks them and fights their own shapes.
  if (logo && !imgError) {
    return (
      <div className={`${DIM[size]} shrink-0 flex items-center justify-center`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={teamName}
          className="w-full h-full object-contain"
          loading="lazy"
          decoding="async"
          // Lifts the mark off the background. Softer in light mode, where a
          // heavy dark shadow reads as grime rather than depth.
          style={{
            filter: theme === 'light'
              ? 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.18))'
              : 'drop-shadow(0 2px 6px rgb(0 0 0 / 0.45))',
          }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Fallback: initials on a tinted plate. The raw brand colour is unusable as
  // text for a lot of teams — pure black (Brooklyn, Juventus) vanishes on the
  // dark card, pure white (Fulham, Tottenham, Leeds) vanishes on the light
  // one — so clamp it for the active theme. legibleOn() leaves colours that
  // already pass untouched, so most teams keep their exact brand shade.
  const ink = legibleOn(color, theme);

  return (
    <div
      className={`${DIM[size]} ${ABBR_TEXT[size]} rounded-full flex items-center justify-center font-black shrink-0 leading-none`}
      style={{ backgroundColor: ink + '22', border: `1.5px solid ${ink}55`, color: ink }}
    >
      {abbr}
    </div>
  );
}
