-- Migration 005 — friends (one-way follow)
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- A "friend" is a one-way follow: follower_id chooses to track followee_id.
-- This powers the Friends view on the rankings page. Ratings are public, so no
-- accept/decline flow is needed.

create table if not exists follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)   -- can't follow yourself
);

create index if not exists follows_follower_idx on follows(follower_id);
create index if not exists follows_followee_idx on follows(followee_id);

-- App talks to the DB only through API routes using the service-role key (which
-- bypasses RLS), so enabling RLS with no policies locks the public anon key out.
alter table follows enable row level security;
