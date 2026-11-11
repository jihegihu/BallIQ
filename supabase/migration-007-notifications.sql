-- Migration 007 — scheduled notifications
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- Supports two daily pushes (an evening "big game" nudge and an end-of-day
-- results digest) sent in each DEVICE's local time, at most once per local day.

-- Where the device is, so "end of day" means the user's day and not Eastern.
-- Lives on push_tokens rather than users because it is a property of the
-- handset: the same account on a phone in London and a tablet in Denver gets
-- each one at the right local hour. IANA name, e.g. 'America/Denver'.
alter table push_tokens add column if not exists timezone text;

-- One master switch, honoured server-side before any send.
alter table users add column if not exists notifications_enabled boolean not null default true;

-- Send ledger. The cron runs hourly and has to be safe to run twice, so the
-- primary key is the dedupe: one row per user per kind per LOCAL day, inserted
-- before the push goes out.
create table if not exists notification_log (
  user_id   uuid not null references users(id) on delete cascade,
  kind      text not null,          -- 'big_game' | 'daily_digest'
  local_day date not null,
  sent_at   timestamptz not null default now(),
  primary key (user_id, kind, local_day)
);

create index if not exists notification_log_sent_idx on notification_log(sent_at desc);

-- Daily rank snapshot, so the digest can say "you passed two people into #4".
-- Ratings are reconstructable from pick deltas (lib/eloHistory.ts) but RANK is
-- not: it depends on everyone else's rating that day, which is gone once it
-- changes. Hence an actual snapshot.
create table if not exists rank_snapshots (
  user_id uuid not null references users(id) on delete cascade,
  day     date not null,
  rank    integer not null,
  elo     integer not null,
  primary key (user_id, day)
);

create index if not exists rank_snapshots_day_idx on rank_snapshots(day desc);

-- Service-role only, same as every other table here.
alter table notification_log enable row level security;
alter table rank_snapshots   enable row level security;
