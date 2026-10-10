import { create } from 'zustand';
import { BetType, ConfidenceLevel, User, UserPick } from '@/types';
import { calculateXP, projectStreak, etDay } from './xp';

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
  // Eastern day, matching the server (lib/xp.ts). placedAt is a UTC instant,
  // so it has to be converted rather than string-prefix compared.
  const today = etDay();
  return calculateXP({
    isFirstToday:    !user.picks.some((p) => etDay(p.placedAt) === today),
    projectedStreak: projectStreak(user.lastPickDate, user.currentStreak),
    betType,
    confidenceLevel,
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface UserStore {
  user: User;
  hydrated: boolean;
  /** A write failed after all retries — the board may be behind the server. */
  syncFailed: boolean;
  /**
   * Bumped on every manual refresh. Components that fetch their own data
   * (the leaderboard, for one) depend on this so a pull-to-refresh reaches
   * them too, without the store needing to know they exist.
   */
  refreshNonce: number;
  hydrate:    (picks: UserPick[], userPatch: Partial<User>) => void;
  refresh:    () => Promise<void>;
  submitPick: (pick: UserPick) => void;
  cancelPick: (pickId: string) => void;
}

// Re-sync local state from the server, so an optimistic update that the server
// rejected — or a rating that settled server-side while the app sat open —
// doesn't leave the UI lying to the user.
export async function rehydrateFromServer() {
  try {
    const res  = await fetch('/api/picks', { cache: 'no-store' });
    const data = await res.json();
    if (data.picks !== undefined) {
      useUserStore.getState().hydrate(data.picks ?? [], data.user ?? {});
    }
  } catch (e) {
    console.warn('[userStore] rehydrate failed:', e);
  }
}

/**
 * fetch + JSON with bounded exponential-backoff retries. A pick placed on a
 * flaky connection used to be logged and dropped: the optimistic entry stayed
 * on screen but the server never recorded it, so it vanished on next hydrate.
 * Returns null only once every attempt has failed.
 */
async function fetchJsonWithRetry(
  url: string,
  init?: RequestInit,
  attempts = 3,
): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      return await res.json();
    } catch {
      if (i === attempts - 1) break;
      // 600ms, 1.2s — short enough that a pick still lands while the user looks at it
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  return null;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: DEFAULT_USER,
  hydrated: false,
  syncFailed: false,
  refreshNonce: 0,

  hydrate: (picks, userPatch) => {
    set((state) => ({
      hydrated: true,
      syncFailed: false,
      user: { ...state.user, ...userPatch, picks },
    }));
  },

  // Re-reads everything this client owns from Supabase. No Odds API involved,
  // so a refresh never spends odds credits.
  refresh: async () => {
    set((s) => ({ refreshNonce: s.refreshNonce + 1 }));
    await rehydrateFromServer();
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

    fetchJsonWithRetry('/api/picks', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(pick),
    }).then((data) => {
      if (data === null) {
        // Never reached the server. Flag it and pull the truth back down so
        // the user doesn't keep seeing a pick that was never recorded.
        set({ syncFailed: true });
        rehydrateFromServer();
        return;
      }
      if (!data.saved) rehydrateFromServer();
    });
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

    fetchJsonWithRetry(`/api/picks?pickId=${encodeURIComponent(pickId)}`, { method: 'DELETE' })
      .then((data) => {
        if (data === null) {
          set({ syncFailed: true });
          rehydrateFromServer();
          return;
        }
        if (!data.deleted) rehydrateFromServer();
      });
  },
}));
