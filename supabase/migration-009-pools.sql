-- Migration 009 — head-to-head pools
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- A pool is a group of friends picking the winner of every game on one slate
-- (an NFL week, a Premier League week, or one or two NBA nights). Most correct
-- wins. Each player stakes Elo; the winner takes what the others staked.
--
-- The transfer is zero-sum on purpose. The rating engine is calibrated so that
-- nobody gains rating without beating something (see lib/elo.ts), and a prize
-- paid from nowhere would be the same inflation that was removed from it.

create table if not exists pools (
  id         uuid primary key default uuid_generate_v4(),
  creator_id uuid not null references users(id) on delete cascade,
  sport      text not null,                 -- 'NFL' | 'EPL' | 'NBA'
  title      text not null,                 -- "NFL · Week of Nov 10"
  -- The Tuesday (US Eastern) that starts the week holding the slate. This is
  -- what "one pool per sport per week" is checked against.
  week_key   date not null,
  stake      integer not null default 50,
  -- open | settled | cancelled. "Locked" is not stored: a pool is locked the
  -- moment now() passes locks_at, and a stored flag could only ever lag that.
  status     text not null default 'open',
  locks_at   timestamptz not null,          -- first game starts: joining closes
  ends_at    timestamptz not null,          -- last game starts
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists pools_status_idx on pools(status, locks_at);

-- The slate, fixed when the pool is created so a later schedule change cannot
-- quietly add or remove games from a pool people have already joined.
create table if not exists pool_matches (
  pool_id  uuid not null references pools(id) on delete cascade,
  match_id text not null,
  primary key (pool_id, match_id)
);

create table if not exists pool_members (
  pool_id    uuid not null references pools(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  status     text not null default 'invited',   -- invited | joined | declined
  invited_by uuid,
  joined_at  timestamptz,
  -- Filled in at settlement.
  correct    integer,
  elo_delta  integer,
  -- Push bookkeeping: each is stamped once, when that notification is sent.
  invite_notified_at timestamptz,
  result_notified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create index if not exists pool_members_user_idx on pool_members(user_id, status);

create table if not exists pool_picks (
  pool_id   uuid not null references pools(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  match_id  text not null,
  pick_side text not null,                      -- home | away | draw (soccer only)
  picked_at timestamptz not null default now(),
  primary key (pool_id, user_id, match_id)
);

-- Service-role only, same as every other table here.
alter table pools        enable row level security;
alter table pool_matches enable row level security;
alter table pool_members enable row level security;
alter table pool_picks   enable row level security;
