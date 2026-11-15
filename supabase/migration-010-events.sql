-- Migration 010 — product analytics events
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- A small first-party event log: which onboarding steps people reach, when
-- they open the app, and whether invites and shares get used. Most of what
-- matters (signups, picks, retention) is already answerable from users and
-- user_picks; this table holds only what those cannot tell us.
--
-- Kept in our own database on purpose. No third party receives anything, and
-- deleting an account deletes its events with it.

create table if not exists events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  props      jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_name_time_idx on events(name, created_at desc);
create index if not exists events_user_time_idx on events(user_id, created_at desc);

-- Service-role only, same as every other table here.
alter table events enable row level security;
