'use client';

import { useState } from 'react';
import { getTeamInfo } from '@/lib/teamLogos';

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
          // Lifts the mark off the dark background without adding chrome.
          style={{ filter: 'drop-shadow(0 2px 6px rgb(0 0 0 / 0.45))' }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Fallback only: initials still need a plate to read as a badge.
  return (
    <div
      className={`${DIM[size]} ${ABBR_TEXT[size]} rounded-full flex items-center justify-center font-black shrink-0 leading-none`}
      style={{ backgroundColor: color + '22', border: `1.5px solid ${color}55`, color }}
    >
      {abbr}
    </div>
  );
}
