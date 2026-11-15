'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/lib/userStore';
import { calculatePickXP } from '@/lib/userStore';
import { calculateEloDelta, getKFactor } from '@/lib/elo';
import { hapticImpact } from '@/lib/haptics';
import { useLongPress } from '@/lib/useLongPress';
import HoldToPick from '@/components/HoldToPick';
import { Match, Sport, UserPick } from '@/types';
import TeamAvatar from '@/components/TeamAvatar';
import RecapBanner from '@/components/RecapBanner';
import PendingPicksBar from '@/components/PendingPicksBar';
import BetSheet from '@/components/BetSheet';
import LiveStrip from '@/components/LiveStrip';
import { useLiveScores } from '@/lib/useLiveScores';
import Icon from '@/components/Icon';
import { isLocked } from '@/lib/lock';
import { PICK_LABEL } from '@/lib/pickLabels';
import { useTourStore } from '@/lib/tourStore';
import TourSportPicker from '@/components/TourSportPicker';

// Hook-per-card wrapper (hooks can't be called inside .map). Long-pressing
// the card chrome opens the full BetSheet with a haptic thump.
//
// The bet buttons inside run their own 3-second hold-to-confirm, so presses
// that start on one must NOT also arm the card's sheet gesture — HoldToPick
// stops propagation, and this guard is the belt to that braces.
function LongPressCard({ onLongPress, children }: { onLongPress: () => void; children: React.ReactNode }) {
  const handlers = useLongPress(() => { hapticImpact('medium'); onLongPress(); });

  return (
    <div
      {...handlers}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-bet-button]')) return;
        handlers.onPointerDown(e);
      }}
      className="bg-card border border-rim rounded-2xl overflow-hidden select-none"
    >
      {children}
    </div>
  );
}

type SportFilter = Sport | 'ALL' | 'SOCCER';
const FILTERS: SportFilter[] = ['ALL', 'NBA', 'NFL', 'MLB', 'SOCCER', 'TENNIS'];
const SOCCER_SPORTS: Sport[] = ['EPL', 'LALIGA', 'BUNDESLIGA', 'SERIEA', 'WORLDCUP'];

const SPORT_LABEL: Partial<Record<Sport, string>> = {
  EPL:        'Premier League',
  LALIGA:     'La Liga',
  BUNDESLIGA: 'Bundesliga',
  SERIEA:     'Serie A',
  WORLDCUP:   'World Cup',
  TENNIS:     'Tennis',
};
function sportName(sport: Sport): string { return SPORT_LABEL[sport] ?? sport; }

/** Just the kick-off time. The day is said once, by the group heading above. */
function fmtClock(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch { return iso; }
}

// ── Time groups ──────────────────────────────────────────────────────────────
// The board holds 25 or more games, and laid out as one flat list a game thirty
// hours away looked exactly as urgent as one starting in ten minutes. Grouping
// by when says what needs a decision now, and the later groups start folded so
// the first screen is the handful of games that actually do.
//
// Anything past tomorrow gets a group per day. It was one "Coming up" bucket,
// which did nothing for a sport that plays at the weekend: every Premier
// League game landed in it, and since it was the only group it opened by
// default — one flat list of fourteen under a single heading.
type Group = { key: string; label: string; games: Match[] };

/** "Soon" is the next few hours, whatever the calendar says. */
const SOON_MS = 3 * 60 * 60 * 1000;
/** With this few games there is nothing to fold away. */
const FOLD_ABOVE = 8;
/** How long a card stays open after a pick before tucking itself away. */
const TUCK_AFTER_MS = 1500;

const noSubscription = () => () => {};

export default function MoneylineGrid({ matches }: { matches: Match[] }) {
  const [chosenSport, setSport]     = useState<SportFilter>('ALL');

  // During the walkthrough's pick step the board shows only the sport the
  // new user chose. Derived rather than copied into state, so the moment the
  // walkthrough ends the filter is simply the user's own again.
  const tourActive = useTourStore((s) => s.active);
  const tourStep   = useTourStore((s) => s.step);
  const tourSport  = useTourStore((s) => s.sport);
  const pinned: SportFilter | null = tourActive && tourStep === 'picks' && tourSport ? tourSport : null;
  const sport: SportFilter = pinned ?? chosenSport;
  const [sheetMatch, setSheetMatch] = useState<Match | null>(null);

  // Day groups and kick-off times depend on the device's clock and timezone,
  // which the server does not have. The list is therefore drawn on the client
  // only; drawing it on both made the two disagree on every card.
  const onClient = useSyncExternalStore(noSubscription, () => true, () => false);
  const [nowMs] = useState(() => Date.now());

  // Groups the user has opened or closed by hand; unset means "use the default".
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // Picked games the user has opened back up to change or remove the pick.
  const [reopened, setReopened] = useState<Set<string>>(new Set());
  // Games picked a moment ago, each with the time it may tuck itself away.
  // They stay open briefly so the confirmation is seen and the card does not
  // vanish from under the finger that picked it.
  const [justPicked, setJustPicked] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (justPicked.size === 0) return;
    const next = Math.min(...justPicked.values());
    const timer = setTimeout(() => {
      const now = Date.now();
      const done = [...justPicked].filter(([, until]) => until <= now).map(([id]) => id);
      setJustPicked((prev) => new Map([...prev].filter(([id]) => !done.includes(id))));
      // Tucking away is also the end of "I opened this to change it".
      setReopened((prev) => new Set([...prev].filter((id) => !done.includes(id))));
    }, Math.max(0, next - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [justPicked]);

  function holdOpen(matchId: string) {
    setJustPicked((prev) => new Map(prev).set(matchId, Date.now() + TUCK_AFTER_MS));
  }

  const user       = useUserStore((s) => s.user);
  const submitPick = useUserStore((s) => s.submitPick);
  const cancelPick = useUserStore((s) => s.cancelPick);

  const kFactor = getKFactor(user.totalPicks, user.weeksActive);

  const upcoming = matches.filter((m) => new Date(m.commenceTime).getTime() > Date.now());

  // Games already under way. The board has always filtered these out, so they
  // simply vanished mid-game; they now surface in a display-only rail above
  // the board. Respects the sport filter so it never contradicts the chips.
  // In progress by the CLOCK, not by stored status. A game that kicked off
  // since the last sync still reads 'pending' in the database, so keying off
  // status meant a live game stayed invisible until a sync happened to run —
  // which on a 2-hourly schedule could be most of the game.
  const liveAll = matches.filter((m) => {
    if (m.status === 'completed') return false;
    const t = new Date(m.commenceTime).getTime();
    return t <= Date.now() && t > Date.now() - 4 * 60 * 60 * 1000;
  });
  const live =
    sport === 'ALL'    ? liveAll :
    sport === 'SOCCER' ? liveAll.filter((m) => SOCCER_SPORTS.includes(m.sport)) :
    liveAll.filter((m) => m.sport === sport);
  const visible =
    sport === 'ALL'    ? upcoming :
    sport === 'SOCCER' ? upcoming.filter((m) => SOCCER_SPORTS.includes(m.sport)) :
    upcoming.filter((m) => m.sport === sport);

  // Only polls while something is actually in progress; costs no odds credits.
  const liveScores = useLiveScores(liveAll.length > 0);

  function getPendingMoneyline(matchId: string): UserPick | undefined {
    return user.picks.find(
      (p) => p.matchId === matchId && p.betType === 'moneyline' && p.outcome === 'pending',
    );
  }

  // Called once a 3-second hold completes. Removal is handled separately by
  // HoldToPick (a plain tap), so this only ever places — swapping sides when a
  // pick already exists on the other team.
  function placeMoneyline(match: Match, side: 'home' | 'away') {
    if (isLocked(match.commenceTime)) return;
    const existing = getPendingMoneyline(match.id);
    if (existing) cancelPick(existing.id);

    const eventElo = side === 'home' ? match.eventElos.moneylineHome : match.eventElos.moneylineAway;
    const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });
    const xpEarned = calculatePickXP(user, 'moneyline', 'medium');

    const pick: UserPick = {
      id:               crypto.randomUUID(),
      matchId:          match.id,
      sport:            match.sport,
      gameTime:         match.commenceTime,
      matchDescription: `${match.homeTeam} vs ${match.awayTeam}`,
      spreadLine:       match.spreadLine,
      overUnderLine:    match.overUnderLine,
      betType:          'moneyline',
      pickSide:         side,
      confidenceLevel:  'medium',
      userEloAtPick:    user.globalElo,
      eventElo,
      projectedGain:    proj.projectedGain,
      projectedLoss:    proj.projectedLoss,
      outcome:          'pending',
      eloDelta:         null,
      xpEarned,
      placedAt:         new Date().toISOString(),
    };
    submitPick(pick);   // HoldToPick already fired the success haptic
    holdOpen(match.id);
  }

  const todayLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Net Elo over the last 7 days, from picks that settled in that window.
  const weekAgo     = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyDelta = user.picks.reduce((sum, p) => {
    if (p.eloDelta == null) return sum;
    const settled = p.resolvedAt ?? p.gameTime;
    return settled && new Date(settled).getTime() >= weekAgo ? sum + p.eloDelta : sum;
  }, 0);

  return (
    <div className={`min-h-screen max-w-md mx-auto px-4 pt-4 ${
      user.picks.some((p) => p.outcome === 'pending') ? 'pb-44' : 'pb-28'
    }`}>

      {/* The BallIQ wordmark and the rating both live in the fixed top bar now,
          so the board opens straight onto the games. */}
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[11px] text-dim">
          {todayLine} · {upcoming.length} game{upcoming.length !== 1 ? 's' : ''}
        </p>
        {weeklyDelta !== 0 && (
          <p className={`text-[11px] font-black tabular-nums ${weeklyDelta > 0 ? 'text-good' : 'text-bad'}`}>
            <Icon name={weeklyDelta > 0 ? 'trendUp' : 'trendDown'} size={13} className="mr-1 -mt-px" />
            {weeklyDelta > 0 ? '+' : '−'}{Math.abs(weeklyDelta)} this week
          </p>
        )}
      </div>

      <TourSportPicker matches={upcoming} />

      <RecapBanner />

      {/* Sport filter — larger type now that the header block is gone */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-0.5 -mx-4 px-4">
        {FILTERS.map((s) => (
          <button
            key={s}
            // Locked while the walkthrough has the board pinned; it offers
            // its own "Change sport".
            disabled={pinned !== null}
            onClick={() => { hapticImpact('light'); setSport(s); }}
            className={`shrink-0 py-2.5 px-5 rounded-xl text-sm font-black tracking-wide transition active:scale-[0.98] disabled:opacity-50 ${
              sport === s
                ? 'bg-primary text-white'
                : 'bg-card text-sub border border-rim hover:border-sub'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <LiveStrip matches={live} scores={liveScores} />

      {/* Game cards */}
      {visible.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="calendar" size={40} strokeWidth={1.25} className="mx-auto mb-3 text-dim" />
          <p className="font-bold text-ink mb-1">
            No {sport === 'ALL' ? '' : sport === 'SOCCER' ? 'soccer ' : sportName(sport as Sport) + ' '}games right now
          </p>
          {/* Point at a sport that actually has games rather than at the
              manual sync button, which no longer exists. */}
          {sport !== 'ALL' && upcoming.length > 0 ? (
            <button
              onClick={() => { hapticImpact('light'); setSport('ALL'); }}
              className="mt-1 text-sm font-bold text-accent active:scale-[0.98] transition"
            >
              See all {upcoming.length} game{upcoming.length !== 1 ? 's' : ''}
              <Icon name="arrowRight" size={15} className="ml-1.5" />
            </button>
          ) : (
            <p className="text-sm text-dim">
              The board fills as games are scheduled — check back soon.
            </p>
          )}
        </div>
      ) : (
        <>
        {/* How to pick, for as long as it is news. After a few picks it is a
            line of instructions above every board that nobody needs. */}
        {(user.totalPicks < 3 || tourActive) && (
          <p className="text-[11px] text-dim mb-2 px-0.5">
            Press and hold a team to lock it in · hold the card header for margin &amp; totals
          </p>
        )}

        {onClient && (() => {
          // In kick-off order, so the groups come out in order too.
          const groups: Group[] = [];
          const add = (key: string, label: string, m: Match) => {
            const last = groups[groups.length - 1];
            if (last?.key === key) last.games.push(m);
            else groups.push({ key, label, games: [m] });
          };
          const today    = new Date(nowMs).toDateString();
          const tomorrow = new Date(nowMs + 86_400_000).toDateString();
          for (const m of [...visible].sort((a, b) => a.commenceTime.localeCompare(b.commenceTime))) {
            const d   = new Date(m.commenceTime);
            const day = d.toDateString();
            if (d.getTime() - nowMs <= SOON_MS) add('soon', 'Starting soon', m);
            else if (day === today)             add('today', 'Later today', m);
            else if (day === tomorrow)          add('tomorrow', 'Tomorrow', m);
            else add(day, d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), m);
          }

          // Open by default: anything today, and always the first group, so a
          // board whose next game is days away does not open on a closed list.
          const openByDefault = (key: string) =>
            visible.length <= FOLD_ABOVE || key === 'soon' || key === 'today' || key === groups[0]?.key;

          return groups.map((group, gi) => {
            const open = toggled[group.key] ?? openByDefault(group.key);
            return (
              <section key={group.key} className={gi === 0 ? '' : 'mt-5'}>
                <button
                  onClick={() => { hapticImpact('light'); setToggled((t) => ({ ...t, [group.key]: !open })); }}
                  aria-expanded={open}
                  className="tap w-full flex items-center justify-between mb-2 px-0.5 text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-black text-ink">{group.label}</span>
                    <span className="text-xs text-dim tabular-nums">
                      {group.games.length} game{group.games.length !== 1 ? 's' : ''}
                    </span>
                  </span>
                  <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="text-dim" />
                </button>

                {open && (
                  <div className="flex flex-col gap-1.5">
                    {group.games.map((match) => {
            const pick   = getPendingMoneyline(match.id);
            const locked = isLocked(match.commenceTime);
            const when   = fmtClock(match.commenceTime);

            // A game that already has a pick on it folds down to one line:
            // the decision is made, so it no longer needs a full card's worth
            // of the screen. Tapping the line opens it again to change or
            // remove the pick.
            const mine = user.picks.filter((p) => p.matchId === match.id && p.outcome === 'pending');
            if (mine.length > 0 && !reopened.has(match.id) && !justPicked.has(match.id)) {
              // Title: the team they backed to win, or failing that the game.
              // Detail: what else is riding on it. Kept apart so the title
              // never has to be cut off to make room for a count.
              const team  = pick ? (pick.pickSide === 'home' ? match.homeTeam : match.awayTeam) : null;
              const extra = mine.length - (pick ? 1 : 0);
              const brief = (name: string) =>
                SOCCER_SPORTS.includes(match.sport) || match.sport === 'TENNIS' ? name : name.split(' ').pop() ?? name;
              const label = team ?? `${brief(match.awayTeam)} at ${brief(match.homeTeam)}`;
              const detail = team
                ? (extra > 0 ? `+${extra} more · ` : '')
                : mine.length === 1 ? `${PICK_LABEL[mine[0].betType]} pick · ` : `${mine.length} picks · `;
              return (
                <button
                  key={match.id}
                  onClick={() => { hapticImpact('light'); setReopened((prev) => new Set(prev).add(match.id)); }}
                  aria-label={`${label}. Open to change or remove.`}
                  className="w-full flex items-center gap-3 bg-card border border-rim rounded-2xl px-3.5 py-2.5 text-left active:scale-[0.98] transition-transform"
                >
                  <span className="w-5 h-5 rounded-full bg-pick flex items-center justify-center shrink-0">
                    <Icon name="check" size={12} strokeWidth={3} className="text-[#06080F]" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-black text-ink truncate">{label}</span>
                    <span className="block text-[11px] text-dim truncate">{detail}{sportName(match.sport)} · {when}</span>
                  </span>
                  <span className="text-right shrink-0 tabular-nums">
                    <span className="block text-sm font-black text-good">
                      +{mine.reduce((sum, p) => sum + p.projectedGain, 0)}
                    </span>
                    <span className="block text-[10px] text-dim">
                      risk <span className="text-bad font-bold">−{mine.reduce((sum, p) => sum + p.projectedLoss, 0)}</span>
                    </span>
                  </span>
                  <Icon name="chevronDown" size={15} className="text-dim shrink-0" />
                </button>
              );
            }

            const homeElo  = match.eventElos.moneylineHome;
            const awayElo  = match.eventElos.moneylineAway;
            const homeProj = calculateEloDelta({ userElo: user.globalElo, eventElo: homeElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });
            const awayProj = calculateEloDelta({ userElo: user.globalElo, eventElo: awayElo, kFactor, confidenceLevel: 'medium', betType: 'moneyline', outcome: 'win' });

            return (
              <LongPressCard key={match.id} onLongPress={() => setSheetMatch(match)}>
                {/* Header: sport and time on a plain line. It used to be a
                    filled band repeating the day on every card; the group
                    heading says the day once now, so the band was 25 copies of
                    weight carrying nothing. */}
                <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-accent uppercase tracking-widest">{sportName(match.sport)}</span>
                    <span className="text-dim text-[10px]">·</span>
                    <span className="text-[12px] font-semibold text-sub">{when}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {reopened.has(match.id) && mine.length > 0 && (
                      <button
                        onClick={() => setReopened((prev) => new Set([...prev].filter((id) => id !== match.id)))}
                        className="tap text-[11px] font-black text-pick"
                      >
                        Done
                      </button>
                    )}
                    <Link
                      href={`/matches/${match.id}`}
                      className="flex items-center gap-0.5 text-dim hover:text-accent transition text-[11px] font-bold"
                    >
                      More picks <Icon name="chevronRight" size={14} className="ml-0.5" />
                    </Link>
                  </div>
                </div>

                {/* Team buttons */}
                <div className="grid grid-cols-2">
                  {(['home', 'away'] as const).map((side) => {
                    const team     = side === 'home' ? match.homeTeam : match.awayTeam;
                    const selected = pick?.pickSide === side;
                    // A placed pick shows the numbers it was LOCKED IN at, not
                    // a fresh recompute. submitPick optimistically bumps
                    // totalPicks, which nudges the K-factor along its curve, so
                    // recomputing made the figure tick by 1 the instant you
                    // picked — as if the odds moved because you looked at them.
                    const proj     = selected && pick
                      ? { projectedGain: pick.projectedGain, projectedLoss: pick.projectedLoss }
                      : side === 'home' ? homeProj : awayProj;

                    return (
                      <HoldToPick
                        key={side}
                        selected={selected}
                        disabled={locked}
                        onCommit={() => placeMoneyline(match, side)}
                        onRemove={() => { const p = getPendingMoneyline(match.id); if (p) cancelPick(p.id); }}
                        className={`flex flex-col items-center py-2 px-1.5 transition-colors ${
                          side === 'away' ? 'border-l border-rim rounded-br-2xl' : 'rounded-bl-2xl'
                        } ${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-layer'}`}
                        selectedClassName="bg-pick/15 ring-1 ring-inset ring-pick/50"
                      >
                        <TeamAvatar teamName={team} size="xs" />
                        <p className={`font-black text-xs leading-tight mt-0.5 ${selected ? 'text-pick' : 'text-ink'}`}>
                          {team}
                        </p>
                        <p className={`text-base font-black tabular-nums leading-tight ${selected ? 'text-pick' : 'text-good'}`}>
                          <Icon name="trendUp" size={14} className="mr-1 -mt-0.5" />+{proj.projectedGain}
                          <span className="ml-0.5 text-[9px] font-bold">Elo</span>
                        </p>
                        <p className="text-[10px] text-dim tabular-nums">
                          risk <span className="text-bad font-bold">−{proj.projectedLoss}</span>
                        </p>
                        {locked && <span className="mt-0.5 text-[8px] text-dim">Locked</span>}
                      </HoldToPick>
                    );
                  })}
                </div>
              </LongPressCard>
            );
                    })}
                  </div>
                )}
              </section>
            );
          });
        })()}
        </>
      )}

      {/* Long-press bet sheet */}
      {sheetMatch && <BetSheet match={sheetMatch} onClose={() => setSheetMatch(null)} />}

      <PendingPicksBar />
    </div>
  );
}
