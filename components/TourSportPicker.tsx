'use client';

// First step of the walkthrough: welcome, and choose a sport to pick from.
//
// Drawn by the games board rather than by the coach card, because the board
// is what holds the schedule — and the whole point of this step is to offer
// only sports that actually have games to pick right now. A sport that is out
// of season is shown but cannot be chosen, so nobody is sent to an empty board.

import Icon from '@/components/Icon';
import { useUserStore } from '@/lib/userStore';
import { useTourStore, TOUR_PICKS_NEEDED, type TourSport } from '@/lib/tourStore';
import { isLocked } from '@/lib/lock';
import { START_ELO } from '@/lib/elo';
import { hapticImpact } from '@/lib/haptics';
import type { Match, Sport } from '@/types';

const SOCCER: Sport[] = ['EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'WORLDCUP'];

const OPTIONS: { key: TourSport; label: string; has: (s: Sport) => boolean }[] = [
  { key: 'NFL',    label: 'NFL',    has: (s) => s === 'NFL' },
  { key: 'NBA',    label: 'NBA',    has: (s) => s === 'NBA' },
  { key: 'MLB',    label: 'MLB',    has: (s) => s === 'MLB' },
  { key: 'SOCCER', label: 'Soccer', has: (s) => SOCCER.includes(s) },
  { key: 'TENNIS', label: 'Tennis', has: (s) => s === 'TENNIS' },
];

export default function TourSportPicker({ matches }: { matches: Match[] }) {
  const hydrated  = useUserStore((s) => s.hydrated);
  const userId    = useUserStore((s) => s.user.id);
  const pickCount = useUserStore((s) => s.user.picks.length);
  const { active, step, owner, chooseSport, goto } = useTourStore();

  if (!hydrated || !active || step !== 'sport' || owner !== userId) return null;

  const open = matches.filter((m) => !isLocked(m.commenceTime));
  const options = OPTIONS.map((o) => ({ ...o, games: open.filter((m) => o.has(m.sport)).length }));
  const anyPlayable = options.some((o) => o.games >= TOUR_PICKS_NEEDED);

  return (
    <div data-sheet role="dialog" aria-modal="true" aria-label="Welcome" className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm bg-card border border-rim/50 rounded-2xl p-6 elev-3">
        <div className="flex justify-center mb-3">
          <Icon name="diamond" size={40} strokeWidth={1.5} className="text-accent" />
        </div>
        <h2 className="text-xl font-black text-ink text-center">Welcome to BallIQ</h2>
        <p className="text-sm text-sub text-center leading-relaxed mt-2">
          You start at {START_ELO} Elo. Call games right and it climbs. No money, ever.
        </p>

        <p className="text-[10px] text-dim uppercase tracking-widest font-bold mt-5 mb-2">
          {anyPlayable ? `Choose a sport for your first ${TOUR_PICKS_NEEDED} picks` : 'Nothing to pick right now'}
        </p>

        <div className="space-y-2">
          {options.map((o) => {
            const playable = o.games >= TOUR_PICKS_NEEDED;
            return (
              <button
                key={o.key}
                disabled={!playable}
                onClick={() => { hapticImpact('light'); chooseSport(o.key, pickCount); }}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-rim bg-layer px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100"
              >
                <span className="text-sm font-black text-ink">{o.label}</span>
                <span className="text-[11px] font-bold text-dim">
                  {playable ? `${o.games} games` : o.games === 0 ? 'Not in season right now' : 'Only 1 game right now'}
                </span>
              </button>
            );
          })}
        </div>

        {/* A dead day on the schedule must not strand a new user on this card. */}
        {!anyPlayable && (
          <button
            onClick={() => goto('pending')}
            className="w-full mt-4 py-2.5 rounded-xl bg-primary text-white text-sm font-black active:scale-[0.98] transition-transform"
          >
            Continue<Icon name="arrowRight" size={14} className="ml-1.5" />
          </button>
        )}
      </div>
    </div>
  );
}
