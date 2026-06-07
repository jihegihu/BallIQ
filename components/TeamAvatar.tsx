'use client';

import { useState } from 'react';
import { getTeamInfo } from '@/lib/teamLogos';

interface Props {
  teamName: string;
  size?: 'xs' | 'sm' | 'md';
}

export default function TeamAvatar({ teamName, size = 'sm' }: Props) {
  const { color, abbr, logo } = getTeamInfo(teamName);
  const [imgError, setImgError] = useState(false);

  const dim =
    size === 'xs' ? 'w-6 h-6'   :
    size === 'sm' ? 'w-8 h-8'   :
                   'w-10 h-10';

  const textSize =
    size === 'xs' ? 'text-[7px]'  :
    size === 'sm' ? 'text-[9px]'  :
                   'text-[10px]';

  const style = {
    backgroundColor: color + '22',
    border: `1.5px solid ${color}55`,
  };

  if (logo && !imgError) {
    return (
      <div className={`${dim} rounded-full shrink-0 flex items-center justify-center overflow-hidden`} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={teamName}
          className="w-[78%] h-[78%] object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${dim} ${textSize} rounded-full flex items-center justify-center font-black shrink-0 leading-none`}
      style={{ ...style, color }}
    >
      {abbr}
    </div>
  );
}
