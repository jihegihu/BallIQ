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
      hint:  PICK_HINT.moneyline,
      options: [
        { betType: 'moneyline', pickSide: 'home', odds: match.moneylineHome, eventElo: match.eventElos.moneylineHome, title: match.homeTeam, showAvatar: match.homeTeam },
        { betType: 'moneyline', pickSide: 'away', odds: match.moneylineAway, eventElo: match.eventElos.moneylineAway, title: match.awayTeam, showAvatar: match.awayTeam },
      ],
    },
    {
      label: PICK_LABEL.spread,
      hint:  PICK_HINT.spread,
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
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section key={section.label}>
          {/* Section heading — same shape for all three, so the page reads as
              one list of choices rather than three different widgets. */}
          <div className="flex items-baseline justify-between mb-2 px-0.5">
            <h2 className="text-xs font-black text-ink uppercase tracking-widest">{section.label}</h2>
            <p className="text-xs text-dim">{section.hint}</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {section.options.map((opt) => {
              const selected = !!getPickFor(opt.betType, opt.pickSide);
              const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo: opt.eventElo, kFactor, confidenceLevel: 'medium', betType: opt.betType, outcome: 'win' });
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
                  className={`rounded-2xl border px-2 py-3 transition-colors ${
                    locked
                      ? 'bg-card border-rim opacity-40 cursor-not-allowed'
                      : 'bg-card border-rim hover:border-sub'
                  }`}
                  selectedClassName="!bg-pick/10 !border-pick/60"
                >
                  {/* Fixed-height glyph slot. Every option gets one, so the
                      three sections produce identical card geometry — the
                      totals used to have no avatar at all, which is what made
                      this page look like three unrelated widgets. */}
                  <span className="h-14 w-full flex items-center justify-center">
                    {opt.showAvatar
                      ? <TeamAvatar teamName={opt.showAvatar} size="sm" />
                      : <span className={`w-14 h-14 rounded-full border flex flex-col items-center justify-center leading-none ${
                          selected ? 'border-pick/50 text-pick' : 'border-rim text-sub'
                        }`}>
                          <span className="text-base font-black">{opt.pickSide === 'over' ? '▲' : '▼'}</span>
                          <span className="text-[11px] font-bold tabular-nums mt-0.5">{match.overUnderLine}</span>
                        </span>}
                  </span>

                  {/* Fixed-height title slot — holds two lines, so a long club
                      name can wrap without making one card taller. */}
                  <span className="h-8 w-full flex items-center justify-center mt-1.5 px-0.5">
                    <span className={`font-black text-sm leading-tight text-center line-clamp-2 ${selected ? 'text-pick' : 'text-ink'}`}>
                      {opt.title}
                    </span>
                  </span>

                  <span className={`block text-xl font-black tabular-nums leading-none mt-2 ${selected ? 'text-pick' : 'text-good'}`}>
                    ▲ +{proj.projectedGain}
                    <span className="ml-1 text-[11px] font-bold">Elo</span>
                  </span>

                  {/* One secondary line instead of two. Risk, then the market
                      read, separated rather than stacked. */}
                  <span className="block text-xs text-dim tabular-nums mt-1">
                    risk <span className="text-bad font-bold">−{proj.projectedLoss}</span>
                    <span className="mx-1.5 text-rim">|</span>
                    {fmtOdds(opt.odds)} · {prob}%
                  </span>
                </HoldToPick>
              );
            })}
          </div>
        </section>
      ))}

      {/* Said once, at the bottom — it used to repeat on all six buttons and
          again in a footer. */}
      <p className="text-center text-xs text-dim">
        {locked
          ? 'Picks are locked — this game is about to start'
          : 'Press and hold to lock a pick · tap a locked pick to undo'}
      </p>
    </div>
  );
}
