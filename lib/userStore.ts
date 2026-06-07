import { create } from 'zustand';
import { BetType, ConfidenceLevel, User, UserPick } from '@/types';
import { calculateEloDelta, getKFactor } from './elo';

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

// ── XP Calculator ─────────────────────────────────────────────────────────────

export function calculatePickXP(
  user: User,
  betType: BetType,
  confidenceLevel: ConfidenceLevel,
): number {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

  const isFirstToday = !user.picks.some((p) => p.placedAt.startsWith(today));

  const projectedStreak =
    user.lastPickDate === today     ? user.currentStreak :
    user.lastPickDate === yesterday ? user.currentStreak + 1 :
    1;

  let xp = 10;
  if (isFirstToday)              xp += 25;
  if (projectedStreak >= 7)      xp += 50;
  else if (projectedStreak >= 3) xp += 15;
  if (betType === 'spread')      xp += 5;
  if (confidenceLevel === 'high') xp += 5;
  return xp;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface UserStore {
  user: User;
  hydrated: boolean;
  hydrate:     (picks: UserPick[], userPatch: Partial<User>) => void;
  submitPick:  (pick: UserPick) => void;
  cancelPick:  (pickId: string) => void;
  resolvePick: (pickId: string, outcome: 'win' | 'loss' | 'push') => void;
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
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

      const newStreak =
        state.user.lastPickDate === today     ? state.user.currentStreak :
        state.user.lastPickDate === yesterday ? state.user.currentStreak + 1 :
        1;

      const xpEarned  = calculatePickXP(state.user, pick.betType, pick.confidenceLevel);
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
    }).catch((e) => console.warn('[picks] DB write failed:', e));
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
      .catch((e) => console.warn('[cancelPick] DB delete failed:', e));
  },

  resolvePick: (pickId, outcome) => {
    const { user } = get();
    const pick = user.picks.find((p) => p.id === pickId);
    if (!pick || pick.outcome !== 'pending') return;

    const kFactor = getKFactor(user.totalPicks, user.weeksActive);
    const result  = calculateEloDelta({
      userElo:         user.globalElo,
      eventElo:        pick.eventElo,
      kFactor,
      confidenceLevel: pick.confidenceLevel,
      betType:         pick.betType,
      outcome,
    });

    const newSportElos = pick.sport
      ? { ...user.sportElos, [pick.sport]: Math.max(0, (user.sportElos[pick.sport] ?? 1200) + result.finalEloDelta) }
      : user.sportElos;

    set((state) => ({
      user: {
        ...state.user,
        globalElo: result.newElo,
        seasonElo: Math.max(0, state.user.seasonElo + result.finalEloDelta),
        sportElos: newSportElos,
        picks: state.user.picks.map((p) =>
          p.id === pickId ? { ...p, outcome, eloDelta: result.finalEloDelta } : p
        ),
      },
    }));

    fetch('/api/resolve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pickId, outcome }),
    }).catch((e) => console.warn('[resolve] DB write failed:', e));
  },
}));
