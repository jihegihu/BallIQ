-- Migration 002 — launch hardening
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run multiple times (everything is IF NOT EXISTS / idempotent).

-- ── 1. Columns the app already reads/writes but schema.sql never added ────────

alter table users add column if not exists nba_elo    integer not null default 1200;
alter table users add column if not exists nfl_elo    integer not null default 1200;
alter table users add column if not exists mlb_elo    integer not null default 1200;
alter table users add column if not exists ncaa_elo   integer not null default 1200;
alter table users add column if not exists soccer_elo integer not null default 1200;
alter table users add column if not exists tennis_elo integer not null default 1200;

alter table user_picks add column if not exists sport           text;
alter table user_picks add column if not exists spread_line     numeric(5,1);
alter table user_picks add column if not exists over_under_line numeric(5,1);

-- ── 2. Row Level Security ──────────────────────────────────────────────────────
-- The NEXT_PUBLIC anon key ships in the browser bundle. Without RLS, anyone can
-- read AND WRITE every table through the Supabase REST endpoint using that key.
-- The app only talks to the DB through API routes using the service-role key,
-- which bypasses RLS — so enabling RLS with no policies (deny-all for anon)
-- locks the public door without changing app behavior.

alter table users         enable row level security;
alter table sport_elos    enable row level security;
alter table matches       enable row level security;
alter table user_picks    enable row level security;
alter table xp_events     enable row level security;
alter table seasons       enable row level security;
alter table season_titles enable row level security;

-- ── 3. Remove the Phase-1 seed user (test data must not ship) ─────────────────

delete from user_picks where user_id = '00000000-0000-0000-0000-000000000001';
delete from users where id = '00000000-0000-0000-0000-000000000001' and clerk_id is null;

-- ── 4. Helpful index for the resolver (pending picks by match) ────────────────

create index if not exists user_picks_pending_match_idx
  on user_picks(match_id) where outcome = 'pending';
