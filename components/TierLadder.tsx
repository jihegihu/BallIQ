'use client';

// The Elo tier ladder shown during onboarding. Its own component because the
// onboarding slides are declared at module scope, where hooks (and therefore
// the active theme) aren't available — and these colours have to be clamped
// per theme to stay legible.

import { TIERS, tierRange, tierStyle } from '@/lib/tiers';
import { useThemeStore } from '@/lib/themeStore';

export default function TierLadder() {
  const theme = useThemeStore((s) => s.theme);

  return (
    <div className="w-full mt-3 space-y-1.5">
      {TIERS.map((t, i) => {
        const color = tierStyle(t.min, theme).color;
        const pct   = 100 - i * 20;
        return (
          <div key={t.label} className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-right text-[10px] font-black" style={{ color }}>
              {t.label}
            </div>
            <div className="flex-1 h-1.5 bg-layer rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color + '99' }} />
            </div>
            <div className="w-20 text-[9px] text-dim">{tierRange(i)}</div>
          </div>
        );
      })}
      <p className="text-center text-[10px] text-accent font-bold mt-1">You start at Advanced ◆ 1,200</p>
      <p className="text-center text-[11px] text-dim pt-1.5">
        Tap a team to pick. Your rating updates automatically when games end.
      </p>
    </div>
  );
}
