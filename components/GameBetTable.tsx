'use client';

// Match detail page: full game view — hero header (teams, records, win
// probability, venue/broadcast) over the complete bet surface. The pick
// logic itself lives in BetPanel, shared with the long-press BetSheet.

import { useRouter } from 'next/navigation';
import { Match } from '@/types';
import MatchHeader from '@/components/MatchHeader';
import BetPanel from '@/components/BetPanel';

export default function GameBetTable({ match }: { match: Match }) {
  const router = useRouter();

  return (
    <div className="min-h-screen pb-28 max-w-md mx-auto px-4 pt-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sub hover:text-ink text-sm mb-4 transition"
      >
        ‹ Back
      </button>

      {/* Hero */}
      <div className="bg-card border border-rim rounded-3xl px-4 pt-5 pb-4 mb-5">
        <MatchHeader match={match} />
      </div>

      {/* All bets */}
      <BetPanel match={match} />
    </div>
  );
}
