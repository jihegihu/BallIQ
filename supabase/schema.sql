-- EloSports Database Schema
-- Run this in your Supabase project: SQL Editor → New query → paste → Run
-- Supabase project: https://your-project-ref.supabase.co

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
-- One row per user. clerk_id will be populated in Phase 2 (Clerk auth).
-- For Phase 1: a single seeded test user is enough to validate the schema.
create table if not exists users (
  id               uuid primary key default uuid_generate_v4(),
  clerk_id         text unique,           -- null until Phase 2 (Clerk auth)
  username         text not null unique,
  global_elo       integer not null default 400,
  season_elo       integer not null default 400,
  xp_total         integer not null default 0,
  total_picks      integer not null default 0,
  weeks_active     integer not null default 0,
  last_pick_date   date,
  current_streak   integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Sport Elos ────────────────────────────────────────────────────────────────
-- One row per user per sport. Global Elo = weighted average of these.
create table if not exists sport_elos (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  sport      text not null,   -- 'NBA' | 'NFL' | 'MLB' | 'NCAAF' | 'NCAAB'
  elo        integer not null default 400,
  updated_at timestamptz not null default now(),
  unique (user_id, sport)
);

-- ── Matches ───────────────────────────────────────────────────────────────────
-- Synced from The-Odds-API every 10 minutes by the sync-odds cron job.
create table if not exists matches (
  id                 text primary key,   -- Odds API game id
  sport              text not null,
  home_team          text not null,
  away_team          text not null,
  commence_time      timestamptz not null,
  status             text not null default 'pending',  -- pending | live | completed
  -- American odds
  moneyline_home     integer,
  moneyline_away     integer,
  spread_line        numeric(5,1),
  spread_home_odds   integer,
  spread_away_odds   integer,
  over_under_line    numeric(5,1),
  over_odds          integer,
  under_odds         integer,
  -- Derived event Elos (recomputed on every odds sync)
  event_elo_ml_home  integer,
  event_elo_ml_away  integer,
  event_elo_over     integer,
  event_elo_under    integer,
  event_elo_sp_home  integer,
  event_elo_sp_away  integer,
  -- Final scores (populated after game ends)
  home_score         integer,
  away_score         integer,
  synced_at          timestamptz not null default now()
);

create index if not exists matches_sport_idx on matches(sport);
create index if not exists matches_commence_idx on matches(commence_time);
create index if not exists matches_status_idx on matches(status);

-- ── User Picks ────────────────────────────────────────────────────────────────
create table if not exists user_picks (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references users(id) on delete cascade,
  match_id           text not null references matches(id),
  match_description  text not null,
  bet_type           text not null,   -- 'moneyline' | 'over_under' | 'spread'
  pick_side          text not null,   -- 'home' | 'away' | 'over' | 'under'
  confidence_level   text not null,   -- 'low' | 'medium' | 'high'
  user_elo_at_pick   integer not null,
  event_elo          integer not null,
  projected_gain     integer not null,
  projected_loss     integer not null,
  outcome            text not null default 'pending',  -- win | loss | push | pending | cancelled
  elo_delta          integer,         -- null until resolved
  xp_earned          integer not null default 0,
  placed_at          timestamptz not null default now(),
  resolved_at        timestamptz,
  -- Enforce: max 1 pick per bet_type per match per user
  unique (user_id, match_id, bet_type)
);

create index if not exists user_picks_user_idx  on user_picks(user_id);
create index if not exists user_picks_match_idx on user_picks(match_id);
create index if not exists user_picks_outcome_idx on user_picks(outcome);

-- ── XP Events ─────────────────────────────────────────────────────────────────
-- Audit log of every XP grant (for debugging and future analytics).
create table if not exists xp_events (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  pick_id    uuid references user_picks(id),
  event_type text not null,   -- 'pick_placed' | 'first_daily' | 'streak_3' | 'streak_7' | 'spread_pick' | 'high_confidence' | 'season_finish'
  xp         integer not null,
  created_at timestamptz not null default now()
);

-- ── Seasons ───────────────────────────────────────────────────────────────────
create table if not exists seasons (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,   -- e.g. "Season 1 — Spring 2026"
  sport       text,            -- null = global season; 'NBA' = sport-specific
  status      text not null default 'pending',  -- pending | active | closing | resolving | awarding | archived
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ── Season Titles ─────────────────────────────────────────────────────────────
-- Permanent titles awarded at season end. These never reset.
create table if not exists season_titles (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  season_id  uuid not null references seasons(id),
  title      text not null,     -- 'Grandmaster' | 'Master' | 'Expert' | 'Candidate Master'
  season_elo integer not null,  -- the Elo that earned this title
  earned_at  timestamptz not null default now(),
  unique (user_id, season_id)
);

-- ── Updated-at trigger ────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger users_updated_at
  before update on users
  for each row execute procedure update_updated_at();

create or replace trigger sport_elos_updated_at
  before update on sport_elos
  for each row execute procedure update_updated_at();

-- ── Seed: test user for Phase 1 development ──────────────────────────────────
-- Remove this block before going to production (Phase 2 adds real auth).
insert into users (id, username, global_elo, season_elo, xp_total, total_picks, weeks_active)
values ('00000000-0000-0000-0000-000000000001', 'GrindKing99', 1400, 1200, 3200, 45, 8)
on conflict (username) do nothing;
