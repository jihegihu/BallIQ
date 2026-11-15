// State for the first-run walkthrough.
//
// The walkthrough moves through real screens rather than describing them, so
// several unrelated components need to know where it is: the board pins itself
// to the chosen sport, the picks and rankings pages switch to the tab being
// shown, and the bottom nav locks. This store is the one thing they all read.
//
// Persisted, so closing the app halfway through resumes at the same step
// instead of starting over or, worse, silently dropping the new user into an
// app they were never shown.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TourStep = 'sport' | 'picks' | 'pending' | 'results' | 'ranks' | 'climb';
export type TourSport = 'NBA' | 'NFL' | 'MLB' | 'SOCCER' | 'TENNIS';

export const TOUR_STEPS: TourStep[] = ['sport', 'picks', 'pending', 'results', 'ranks', 'climb'];

/** Picks a new user makes before the walkthrough moves on. */
export const TOUR_PICKS_NEEDED = 2;

/** The screen each step happens on. */
export const TOUR_ROUTE: Record<TourStep, string> = {
  sport:   '/',
  picks:   '/',
  pending: '/picks',
  results: '/picks',
  ranks:   '/leaderboard',
  climb:   '/leaderboard',
};

interface TourStore {
  /**
   * True once the saved state has been read back from the device. Nothing
   * acts on the walkthrough before this: the server renders with the defaults,
   * so reading storage any earlier would make the first client render disagree
   * with the page it is attaching to.
   */
  ready: boolean;
  /**
   * The account this state belongs to. The store is saved on the device, not
   * the account, so without this a second person signing in on the same phone
   * would inherit the first person's "already done" and never be shown the app.
   */
  owner: string | null;
  claim: (userId: string) => void;
  /** The walkthrough has been finished (or was never needed). */
  done: boolean;
  active: boolean;
  step: TourStep;
  sport: TourSport | null;
  /** How many picks the user had when the pick step began. */
  picksAtStart: number;
  /** Started by hand from Account, by someone who already knows the app. */
  replay: boolean;

  start: (picksAtStart: number, replay?: boolean) => void;
  chooseSport: (sport: TourSport, picksNow: number) => void;
  goto: (step: TourStep) => void;
  next: () => void;
  finish: () => void;
  /** For accounts that already have picks: nothing to show them. */
  markDone: () => void;
}

export const useTourStore = create<TourStore>()(
  persist(
    (set, get) => ({
      ready: false,
      owner: null,
      claim: (userId) =>
        set({ owner: userId, done: false, active: false, step: 'sport', sport: null, picksAtStart: 0, replay: false }),
      done: false,
      active: false,
      step: 'sport',
      sport: null,
      picksAtStart: 0,
      replay: false,

      start: (picksAtStart, replay = false) =>
        set({ active: true, step: 'sport', sport: null, picksAtStart, replay }),

      // The count restarts here, so picks only count once a sport is chosen —
      // and changing sport does not throw away picks already made.
      chooseSport: (sport, picksNow) =>
        set((s) => ({
          sport,
          step: 'picks',
          picksAtStart: s.sport === null ? picksNow : s.picksAtStart,
        })),

      goto: (step) => set({ step }),

      next: () => {
        const i = TOUR_STEPS.indexOf(get().step);
        if (i >= TOUR_STEPS.length - 1) get().finish();
        else set({ step: TOUR_STEPS[i + 1] });
      },

      finish: () => set({ active: false, done: true, step: 'sport', sport: null, replay: false }),
      markDone: () => set({ done: true }),
    }),
    {
      name: 'balliq-tour',
      // Loaded by TourCoach after mount, not at import time — see `ready`.
      skipHydration: true,
      // `ready` describes this page load, not the user, so it is never saved.
      partialize: ({ owner, done, active, step, sport, picksAtStart, replay }) =>
        ({ owner, done, active, step, sport, picksAtStart, replay }),
    },
  ),
);
