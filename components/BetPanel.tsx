'use client';

// The full bet surface for one game — moneyline, spread, over/under — as three
// stacked sections with big thumb-friendly buttons. Shared by the match detail
// page and the long-press BetSheet so pick behavior stays identical everywhere.
// One pending pick per bet type per match (picking the other side swaps it;
// tapping your pick again removes it).

import { useUserStore, calculatePickXP } from '@/lib/userStore';
import { calculateEloDelta, getKFactor, eventEloToProb } from '@/lib/elo';
import { hapticSuccess, hapticImpact } from '@/lib/haptics';
import { Match, BetType, PickSide, UserPick } from '@/types';
import TeamAvatar from '@/components/TeamAvatar';

function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}`; }

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

  function handle(opt: Option) {
    if (locked) return;
    const existing = getPickFor(opt.betType, opt.pickSide);
    if (existing) { cancelPick(existing.id); hapticImpact('light'); return; }

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
    });
    hapticSuccess(); // native-only tactile confirm; no-op on web
  }

  const awaySpread    = match.spreadLine === 0 ? 0 : -match.spreadLine;
  const homeSpreadStr = match.spreadLine > 0 ? `+${match.spreadLine}` : `${match.spreadLine}`;
  const awaySpreadStr = awaySpread > 0 ? `+${awaySpread}` : `${awaySpread}`;

  const sections: { label: string; hint: string; options: [Option, Option] }[] = [
    {
      label: 'Moneyline',
      hint:  'who wins the game',
      options: [
        { betType: 'moneyline', pickSide: 'home', odds: match.moneylineHome, eventElo: match.eventElos.moneylineHome, title: match.homeTeam, showAvatar: match.homeTeam },
        { betType: 'moneyline', pickSide: 'away', odds: match.moneylineAway, eventElo: match.eventElos.moneylineAway, title: match.awayTeam, showAvatar: match.awayTeam },
      ],
    },
    {
      label: 'Spread',
      hint:  'win margin vs the line',
      options: [
        { betType: 'spread', pickSide: 'home', odds: match.spreadHomeOdds, eventElo: match.eventElos.spreadHome, title: `${match.homeTeam} ${homeSpreadStr}`, showAvatar: match.homeTeam },
        { betType: 'spread', pickSide: 'away', odds: match.spreadAwayOdds, eventElo: match.eventElos.spreadAway, title: `${match.awayTeam} ${awaySpreadStr}`, showAvatar: match.awayTeam },
      ],
    },
    {
      label: 'Total Points',
      hint:  `combined score vs ${match.overUnderLine}`,
      options: [
        { betType: 'over_under', pickSide: 'over',  odds: match.overOdds,  eventElo: match.eventElos.over,  title: `Over ${match.overUnderLine}` },
        { betType: 'over_under', pickSide: 'under', odds: match.underOdds, eventElo: match.eventElos.under, title: `Under ${match.overUnderLine}` },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="flex items-baseline justify-between mb-1.5 px-0.5">
            <p className="text-[11px] font-black text-sub uppercase tracking-widest">{section.label}</p>
            <p className="text-[10px] text-dim">{section.hint}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {section.options.map((opt) => {
              const selected = !!getPickFor(opt.betType, opt.pickSide);
              const proj     = calculateEloDelta({ userElo: user.globalElo, eventElo: opt.eventElo, kFactor, confidenceLevel: 'medium', betType: opt.betType, outcome: 'win' });
              const prob     = Math.round(eventEloToProb(opt.eventElo) * 100);

              return (
                <button
                  key={opt.pickSide}
                  onClick={() => handle(opt)}
                  disabled={locked}
                  className={`flex flex-col items-center rounded-2xl border py-3.5 px-2 transition-all active:scale-[0.97] ${
                    selected
                      ? 'bg-accent/15 border-accent/50'
                      : locked
                      ? 'bg-card border-rim opacity-40 cursor-not-allowed'
                      : 'bg-card border-rim hover:border-sub'
                  }`}
                >
                  {opt.showAvatar && <TeamAvatar teamName={opt.showAvatar} size="sm" />}
                  <p className={`font-black text-sm leading-tight mt-1 text-center ${selected ? 'text-accent' : 'text-ink'}`}>
                    {opt.title}
                  </p>
                  <p className={`text-xl font-black tabular-nums leading-tight mt-1 ${selected ? 'text-violet-300' : 'text-emerald-500'}`}>
                    ▲ +{proj.projectedGain}
                    <span className="ml-1 text-[10px] font-bold">Elo</span>
                  </p>
                  <p className="text-[10px] text-dim tabular-nums mt-0.5">
                    risk <span className="text-red-500 font-bold">−{proj.projectedLoss}</span>
                  </p>
                  <p className="text-[10px] text-dim tabular-nums mt-1">
                    {fmtOdds(opt.odds)} · {prob}%
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {locked && (
        <p className="text-center text-xs text-dim">🔒 Picks locked — game starting soon</p>
      )}
      <p className="text-center text-[11px] text-dim">
        Tap to pick · tap again to remove
      </p>
    </div>
  );
}
