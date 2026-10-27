'use client';

// The full bet surface for one game — moneyline, spread, over/under — as three
// stacked sections with big thumb-friendly buttons. Shared by the match detail
// page and the long-press BetSheet so pick behavior stays identical everywhere.
// One pending pick per bet type per match (picking the other side swaps it;
// tapping your pick again removes it).

import { useUserStore, calculatePickXP } from '@/lib/userStore';
import { PICK_LABEL, PICK_HINT } from '@/lib/pickLabels';
import { calculateEloDelta, getKFactor, eventEloToProb } from '@/lib/elo';
import { Match, BetType, PickSide, UserPick } from '@/types';
import TeamAvatar from '@/components/TeamAvatar';
import HoldToPick from '@/components/HoldToPick';

function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}`; }

/** "Boston Celtics" -> "Celtics". The avatar supplies the rest. */
function shortName(team: string): string {
  const parts = team.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : team;
}

function isLocked(commenceTime: string) {
  return new Date(commenceTime).getTime() - Date.now() < 15 * 60 * 1000;
}

type Option = {
  betType: BetType;
  pickSide: PickSide;
  odds: number;
  eventElo: number;
  title: string;        // button headline ("Celtics", "Over 212.5", "-3.5")
  showAvatar?: string;  // team name to render an avatar for
};

export default function BetPanel({ match }: { match: Match }) {
  const user       = useUserStore((s) => s.user);
  const submitPick = useUserStore((s) => s.submitPick);
  const cancelPick = useUserStore((s) => s.cancelPick);

  const kFactor = getKFactor(user.totalPicks, user.weeksActive);
  const locked  = isLocked(match.commenceTime);

  function getPickFor(betType: BetType, pickSide: PickSide): UserPick | undefined {
    return user.picks.find(
      (p) => p.matchId === match.id && p.betType === betType && p.pickSide === pickSide && p.outcome === 'pending',
    );
  }

  // Runs once a 3-second hold completes; removal is a plain tap handled by
  // HoldToPick, so this only places (swapping out any other pick of the same
  // bet type on this match).
  function place(opt: Option) {
    if (locked) return;

    const sameType = user.picks.find(
      (p) => p.matchId === match.id && p.betType === opt.betType && p.outcome === 'pending',
    );
    if (sameType) cancelPick(sameType.id);

    const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo: opt.eventElo, kFactor, confidenceLevel: 'medium', betType: opt.betType, outcome: 'win' });
    const xpEarned = calculatePickXP(user, opt.betType, 'medium');

    submitPick({
      id:               crypto.randomUUID(),
      matchId:          match.id,
      sport:            match.sport,
      gameTime:         match.commenceTime,
      matchDescription: `${match.homeTeam} vs ${match.awayTeam}`,
      spreadLine:       match.spreadLine,
      overUnderLine:    match.overUnderLine,
      betType:          opt.betType,
      pickSide:         opt.pickSide,
      confidenceLevel:  'medium',
      userEloAtPick:    user.globalElo,
      eventElo:         opt.eventElo,
      projectedGain:    proj.projectedGain,
      projectedLoss:    proj.projectedLoss,
      outcome:          'pending',
      eloDelta:         null,
      xpEarned,
      placedAt:         new Date().toISOString(),
    });   // HoldToPick already fired the success haptic
  }

  const awaySpread    = match.spreadLine === 0 ? 0 : -match.spreadLine;
  const homeSpreadStr = match.spreadLine > 0 ? `+${match.spreadLine}` : `${match.spreadLine}`;
  const awaySpreadStr = awaySpread > 0 ? `+${awaySpread}` : `${awaySpread}`;

  const sections: { label: string; hint: string; options: [Option, Option] }[] = [
    {
      label: PICK_LABEL.moneyline,
      hint:  PICK_HINT.moneyline,   // "who wins the game" — no line involved
      options: [
        { betType: 'moneyline', pickSide: 'home', odds: match.moneylineHome, eventElo: match.eventElos.moneylineHome, title: match.homeTeam, showAvatar: match.homeTeam },
        { betType: 'moneyline', pickSide: 'away', odds: match.moneylineAway, eventElo: match.eventElos.moneylineAway, title: match.awayTeam, showAvatar: match.awayTeam },
      ],
    },
    {
      label: PICK_LABEL.spread,
      hint:  `margin vs ${Math.abs(match.spreadLine)}`,
      options: [
        { betType: 'spread', pickSide: 'home', odds: match.spreadHomeOdds, eventElo: match.eventElos.spreadHome, title: `${shortName(match.homeTeam)} ${homeSpreadStr}`, showAvatar: match.homeTeam },
        { betType: 'spread', pickSide: 'away', odds: match.spreadAwayOdds, eventElo: match.eventElos.spreadAway, title: `${shortName(match.awayTeam)} ${awaySpreadStr}`, showAvatar: match.awayTeam },
      ],
    },
    {
      label: PICK_LABEL.over_under,
      hint:  `combined score vs ${match.overUnderLine}`,
      options: [
        { betType: 'over_under', pickSide: 'over',  odds: match.overOdds,  eventElo: match.eventElos.over,  title: `Over ${match.overUnderLine}` },
        { betType: 'over_under', pickSide: 'under', odds: match.underOdds, eventElo: match.eventElos.under, title: `Under ${match.overUnderLine}` },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        /* One bordered card per market. Three identical containers is what
           makes the markets read as separate things — previously they were
           three bare grids separated only by a small heading, so it was easy
           to lose track of which kind of pick you were looking at. */
        <section key={section.label} className="bg-card border border-rim rounded-2xl overflow-hidden">
          <header className="flex items-baseline justify-between px-3 py-2 bg-layer border-b border-rim">
            <h2 className="text-xs font-black text-ink uppercase tracking-widest">{section.label}</h2>
            <p className="text-xs text-dim truncate ml-2">{section.hint}</p>
          </header>

          <div className="grid grid-cols-2 gap-2 p-2">
            {section.options.map((opt) => {
              const placed   = getPickFor(opt.betType, opt.pickSide);
              const selected = !!placed;
              // Same as the board: once placed, show the locked-in figures
              // rather than recomputing against a K-factor that just moved.
              const proj     = placed
                ? { projectedGain: placed.projectedGain, projectedLoss: placed.projectedLoss }
                : calculateEloDelta({ userElo: user.globalElo, eventElo: opt.eventElo, kFactor, confidenceLevel: 'medium', betType: opt.betType, outcome: 'win' });
              const prob     = Math.round(eventEloToProb(opt.eventElo) * 100);

              return (
                <HoldToPick
                  key={opt.pickSide}
                  selected={selected}
                  disabled={locked}
                  onCommit={() => place(opt)}
                  onRemove={() => {
                    const existing = getPickFor(opt.betType, opt.pickSide);
                    if (existing) cancelPick(existing.id);
                  }}
                  className={`rounded-xl border px-2.5 py-2 transition-colors ${
                    locked
                      ? 'bg-layer border-rim opacity-40 cursor-not-allowed'
                      : 'bg-layer border-rim hover:border-sub'
                  }`}
                  selectedClassName="!bg-pick/10 !border-pick/60"
                >
                  {/* Identity inline rather than stacked — this is what took
                      the card from ~150px down to ~80px. */}
                  <span className="w-full flex items-center gap-1.5 min-w-0">
                    {opt.showAvatar
                      ? <TeamAvatar teamName={opt.showAvatar} size="xs" />
                      : <span className={`w-8 h-8 shrink-0 rounded-full border flex items-center justify-center text-sm font-black ${
                          selected ? 'border-pick/50 text-pick' : 'border-rim text-sub'
                        }`}>
                          {opt.pickSide === 'over' ? '▲' : '▼'}
                        </span>}
                    <span className={`flex-1 min-w-0 truncate text-left text-sm font-black ${selected ? 'text-pick' : 'text-ink'}`}>
                      {opt.title}
                    </span>
                  </span>

                  <span className={`w-full text-left text-lg font-black tabular-nums leading-none mt-1.5 ${selected ? 'text-pick' : 'text-good'}`}>
                    +{proj.projectedGain}
                    <span className="ml-1 text-[11px] font-bold text-dim">Elo</span>
                  </span>

                  <span className="w-full text-left text-xs text-dim tabular-nums mt-0.5">
                    <span className="text-bad font-bold">−{proj.projectedLoss}</span>
                    <span className="mx-1 text-rim">·</span>
                    {fmtOdds(opt.odds)}
                    <span className="mx-1 text-rim">·</span>
                    {prob}%
                  </span>
                </HoldToPick>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-dim">
        {locked
          ? 'Picks are locked — this game is about to start'
          : 'Press and hold to lock a pick · tap a locked pick to undo'}
      </p>
    </div>
  );
}
