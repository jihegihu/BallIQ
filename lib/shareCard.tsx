// The pictures people share: their rating, or how a pool went.
//
// Returned as plain elements for next/og's ImageResponse, which draws them to
// a PNG. That renderer supports flexbox and little else — every box with more
// than one child must say `display: flex`, and there is no grid — so the
// layout here is deliberately simple columns and rows.
//
// Square, because a square survives being dropped into a message thread, a
// story or a feed without the important part being cropped.

import type { ReactElement } from 'react';
import { tierFor } from './tiers';

export const CARD_SIZE = 1080;

const C = {
  base: '#06080F', card: '#0D1220', rim: '#1E2D4A',
  ink: '#FFFFFF', sub: '#94A3B8', dim: '#7C8AA3',
  accent: '#A78BFA', good: '#34D399', bad: '#F87171',
};

function Frame({ kicker, children }: { kicker: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.base, padding: 64, fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: C.card, border: `2px solid ${C.rim}`, borderRadius: 48, padding: 72,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 52, color: C.ink, letterSpacing: -1 }}>BallIQ</div>
          <div style={{ display: 'flex', fontSize: 30, color: C.accent, letterSpacing: 4 }}>{kicker}</div>
        </div>
        {children}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30, color: C.dim }}>
          <div style={{ display: 'flex' }}>Pick games. Build a rating. No money.</div>
          <div style={{ display: 'flex', color: C.sub }}>balliq.dev</div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', fontSize: 28, color: C.dim, letterSpacing: 3 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 56, color: C.ink, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export type RankCardData = {
  username: string;
  elo: number;
  rank: number | null;
  totalRated: number;
  wins: number;
  losses: number;
};

export function rankCard(d: RankCardData): ReactElement {
  const tier = tierFor(d.elo);
  const top = d.rank !== null && d.totalRated > 0
    ? Math.max(1, Math.ceil((d.rank / d.totalRated) * 100))
    : null;

  return (
    <Frame kicker="RATING">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 48, color: C.sub }}>{d.username}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}>
          <div style={{ display: 'flex', fontSize: 230, color: C.ink, letterSpacing: -8, lineHeight: 1 }}>
            {d.elo.toLocaleString('en-US')}
          </div>
          <div style={{ display: 'flex', fontSize: 52, color: C.dim, marginLeft: 20 }}>Elo</div>
        </div>
        <div style={{ display: 'flex', fontSize: 64, color: tier.hex, marginTop: 12 }}>{tier.label}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${C.rim}`, paddingTop: 40 }}>
        <Fact label="GLOBAL RANK" value={d.rank !== null ? `#${d.rank}` : 'Unranked'} />
        <Fact label="RECORD" value={`${d.wins}W ${d.losses}L`} />
        <Fact label="STANDING" value={top !== null ? `Top ${top}%` : 'New'} />
      </div>
    </Frame>
  );
}

export type PoolCardData = {
  username: string;
  title: string;
  delta: number;
  correct: number;
  games: number;
  players: number;
  stake: number;
};

export function poolCard(d: PoolCardData): ReactElement {
  const tone = d.delta > 0 ? C.good : d.delta < 0 ? C.bad : C.sub;
  const amount = `${d.delta > 0 ? '+' : d.delta < 0 ? '-' : ''}${Math.abs(d.delta)}`;
  const headline = d.delta > 0 ? 'Won the pool' : d.delta < 0 ? 'Played the pool' : 'Tied the pool';

  return (
    <Frame kicker="HEAD TO HEAD">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 48, color: C.sub }}>{d.username}</div>
        <div style={{ display: 'flex', fontSize: 60, color: C.ink, marginTop: 8 }}>{headline}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 8 }}>
          <div style={{ display: 'flex', fontSize: 230, color: tone, letterSpacing: -8, lineHeight: 1 }}>{amount}</div>
          <div style={{ display: 'flex', fontSize: 52, color: C.dim, marginLeft: 20 }}>Elo</div>
        </div>
        <div style={{ display: 'flex', fontSize: 44, color: C.sub, marginTop: 16 }}>{d.title}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${C.rim}`, paddingTop: 40 }}>
        <Fact label="CORRECT" value={`${d.correct} of ${d.games}`} />
        <Fact label="PLAYERS" value={String(d.players)} />
        <Fact label="STAKE" value={`${d.stake} Elo`} />
      </div>
    </Frame>
  );
}
