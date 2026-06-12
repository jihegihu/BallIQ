import { create } from 'zustand';
import { BetType, ConfidenceLevel, User, UserPick } from '@/types';
import { calculateXP, projectStreak } from './xp';

const DEFAULT_USER: User = {
  id:            '',
  username:      '',
  globalElo:     1200,
  seasonElo:     1200,
  sportElos:     {},
  xpTotal:       0,
  totalPicks:    0,
  weeksActive:   1,
  picks:         [],
  lastPickDate:  null,
  currentStreak: 0,
};

// ── XP Calculator (optimistic client-side estimate; the API recomputes) ──────

export function calculatePickXP(
  user: User,
  betType: BetType,
  confidenceLevel: ConfidenceLevel,
): number {
  const today = new Date().toISOString().split('T')[0];
  return calculateXP({
    isFirstToday:    !user.picks.some((p) => p.placedAt.startsWith(today)),
    projectedStreak: projectStreak(user.lastPickDate, user.currentStreak),
    betType,
    confidenceLevel,
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface UserStore {
  user: User;
  hydrated: boolean;
  hydrate:    (picks: UserPick[], userPatch: Partial<User>) => void;
  submitPick: (pick: UserPick) => void;
  cancelPick: (pickId: string) => void;
}

// Re-sync local state from the server after a write is rejected, so the
// optimistic update doesn't leave the UI lying to the user.
async function rehydrateFromServer() {
  try {
    const res  = await fetch('/api/picks');
    const data = await res.json();
    if (data.picks !== undefined) {
      useUserStore.getState().hydrate(data.picks ?? [], data.user ?? {});
    }
  } catch (e) {
    console.warn('[userStore] rehydrate failed:', e);
  }
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: DEFAULT_USER,
  hydrated: false,

  hydrate: (picks, userPatch) => {
    set((state) => ({
      hydrated: true,
      user: { ...state.user, ...userPatch, picks },
    }));
  },

  submitPick: (pick: UserPick) => {
    set((state) => {
      const today     = new Date().toISOString().split('T')[0];
      const newStreak = projectStreak(state.user.lastPickDate, state.user.currentStreak);

      const xpEarned   = calculatePickXP(state.user, pick.betType, pick.confidenceLevel);
      const actualPick = { ...pick, xpEarned };

      return {
        user: {
          ...state.user,
          picks:         [...state.user.picks, actualPick],
          xpTotal:       state.user.xpTotal + xpEarned,
          totalPicks:    state.user.totalPicks + 1,
          lastPickDate:  today,
          currentStreak: newStreak,
        },
      };
    });

    fetch('/api/picks', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(pick),
    })
      .then((r) => r.json())
      .then((data) => { if (!data.saved) rehydrateFromServer(); })
      .catch((e) => console.warn('[picks] DB write failed:', e));
  },

  cancelPick: (pickId: string) => {
    const pick = get().user.picks.find((p) => p.id === pickId);
    if (!pick || pick.outcome !== 'pending') return;

    set((state) => ({
      user: {
        ...state.user,
        picks:      state.user.picks.filter((p) => p.id !== pickId),
        xpTotal:    Math.max(0, state.user.xpTotal - pick.xpEarned),
        totalPicks: Math.max(0, state.user.totalPicks - 1),
      },
    }));

    fetch(`/api/picks?pickId=${encodeURIComponent(pickId)}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => { if (!data.deleted) rehydrateFromServer(); })
      .catch((e) => console.warn('[cancelPick] DB delete failed:', e));
  },
}));
