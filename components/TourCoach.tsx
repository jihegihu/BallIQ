'use client';

// The first-run walkthrough.
//
// It replaced a set of slides that explained the app before the user had seen
// it. This one moves through the real screens instead: choose a sport, make
// two picks, then one tap each on where picks wait, what results and stats
// look like, the rankings, and the ladder.
//
// "Forced" here means the walkthrough decides which screen is showing and the
// bottom nav is locked until it ends. It does not mean trapped: once the first
// pick is in there is a Skip, because a new user whose board will not load —
// or an App Store reviewer — must always have a way through.

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { useUserStore } from '@/lib/userStore';
import { useTourStore, TOUR_STEPS, TOUR_ROUTE, TOUR_PICKS_NEEDED, type TourStep } from '@/lib/tourStore';
import { START_ELO } from '@/lib/elo';
import { tierFor } from '@/lib/tiers';
import { track } from '@/lib/events';

const COPY: Record<Exclude<TourStep, 'sport' | 'picks'>, { title: string; body: string }> = {
  pending: {
    title: 'Your picks wait here',
    body:  'Open picks sit under Pending until the game ends. You can remove one any time before it starts.',
  },
  results: {
    title: 'Results and stats',
    body:  'Settled picks move to Results with the Elo you won or lost, and your record builds up above them. These are examples.',
  },
  ranks: {
    title: 'See where you rank',
    body:  'Everyone is ranked by Elo. Switch sport to see each board, or add friends to compare with them.',
  },
  climb: {
    title: 'Your climb',
    body:  `You start at ${START_ELO} in ${tierFor(START_ELO).label}. Each tier above is a rating you have to reach.`,
  },
};

export default function TourCoach() {
  const pathname = usePathname();
  const router   = useRouter();

  const hydrated   = useUserStore((s) => s.hydrated);
  const userId     = useUserStore((s) => s.user.id);
  const pickCount  = useUserStore((s) => s.user.picks.length);
  const totalPicks = useUserStore((s) => s.user.totalPicks);

  const tour = useTourStore();
  const { ready, owner, done, active, step } = tour;

  // Read the saved walkthrough state back, once, after the page has mounted.
  useEffect(() => {
    Promise.resolve(useTourStore.persist.rehydrate()).then(() => useTourStore.setState({ ready: true }));
  }, []);

  // Decide, once the account has loaded, whether this person needs it at all.
  useEffect(() => {
    if (!ready || !hydrated || !userId) return;
    // The store lives on the device. A different account signing in on the
    // same phone must not inherit the last person's "already done".
    if (owner !== userId) { tour.claim(userId); return; }
    if (done || active) return;
    if (totalPicks === 0 && pickCount === 0) tour.start(0);
    else tour.markDone();                       // already playing: nothing to show
  }, [ready, hydrated, userId, owner, done, active, totalPicks, pickCount, tour]);

  // Keep the walkthrough on the screen its current step is about.
  useEffect(() => {
    if (!ready || !hydrated || !active || owner !== userId) return;
    const target = TOUR_ROUTE[step];
    // Opening a game to pick from its own page is part of the pick step.
    const allowed = pathname === target || (step === 'picks' && pathname.startsWith('/matches'));
    if (!allowed) router.replace(target);
  }, [ready, hydrated, active, owner, userId, step, pathname, router]);

  // The sport chooser is drawn by the board, which is what knows the schedule.
  if (!ready || !hydrated || !active || owner !== userId || step === 'sport') return null;

  const made   = Math.max(0, pickCount - tour.picksAtStart);
  const index  = TOUR_STEPS.indexOf(step);
  const isLast = index === TOUR_STEPS.length - 1;

  let title: string;
  let body: string;
  let action: { label: string; run: () => void } | null;

  if (step === 'picks') {
    const left = TOUR_PICKS_NEEDED - made;
    title  = left > 0 ? `Make ${TOUR_PICKS_NEEDED} picks` : 'Both picks are in';
    body   = left > 0
      ? 'Press and hold a team for one second to lock it in. Each button shows the Elo you would win.'
      : 'They count toward your rating as soon as the games end.';
    action = left > 0 ? null : { label: 'Continue', run: tour.next };
  } else {
    ({ title, body } = COPY[step]);
    action = isLast
      ? { label: 'Start playing', run: () => { tour.finish(); router.push('/'); } }
      : { label: 'Next', run: tour.next };
  }

  return (
    <div
      className="fixed left-0 right-0 z-[60] px-4 pointer-events-none"
      // Sits just above the bottom nav (h-16) and the home-indicator area.
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.5rem)' }}
    >
      <div
        role="dialog"
        aria-label="Getting started"
        aria-live="polite"
        className="max-w-md mx-auto bg-card border border-accent/50 rounded-2xl p-4 elev-3 pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-black text-accent uppercase tracking-widest">
            Step {index + 1} of {TOUR_STEPS.length}
          </p>
          <div className="flex gap-1">
            {TOUR_STEPS.map((s, i) => (
              <span key={s} className={`h-1 rounded-full ${i <= index ? 'w-4 bg-accent' : 'w-1.5 bg-rim'}`} />
            ))}
          </div>
        </div>

        <p className="text-sm font-black text-ink">{title}</p>
        <p className="text-xs text-sub leading-relaxed mt-1">{body}</p>

        {step === 'picks' && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1 h-1.5 bg-layer rounded-full overflow-hidden">
              <div
                className="h-full bg-pick rounded-full transition-all"
                style={{ width: `${Math.min(100, (made / TOUR_PICKS_NEEDED) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] font-black text-ink tabular-nums">
              {Math.min(made, TOUR_PICKS_NEEDED)} of {TOUR_PICKS_NEEDED}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-4 text-xs font-bold text-dim">
            {step === 'picks' && (
              <button onClick={() => tour.goto('sport')} className="hover:text-sub">Change sport</button>
            )}
            {/* Only once a pick is in, or for someone replaying it by choice. */}
            {step === 'picks' && made < TOUR_PICKS_NEEDED && (made >= 1 || tour.replay) && (
              <button onClick={() => { track('tour_skipped', { made }); tour.next(); }} className="hover:text-sub">Skip</button>
            )}
          </div>
          {action && (
            <button
              onClick={action.run}
              className="shrink-0 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-black active:scale-95 transition-transform"
            >
              {action.label}<Icon name="arrowRight" size={14} className="ml-1.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Room at the bottom of the page for the coach card, so the last rows of a
 * list can still be scrolled clear of it.
 */
export function TourSpacer() {
  const active = useTourStore((s) => s.active);
  return active ? <div aria-hidden className="h-40" /> : null;
}
