-- Migration 006 — push notification device tokens
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- One row per device token. A user can have several (phone + tablet), and a
-- token can migrate to a new user if a device is handed over, so token is the
-- primary key and user_id is overwritten on conflict.

create table if not exists push_tokens (
  token      text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  platform   text not null default 'ios',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on push_tokens(user_id);

-- App talks to the DB only through API routes using the service-role key (which
-- bypasses RLS), so enabling RLS with no policies locks the public anon key out.
alter table push_tokens enable row level security;
