-- Migration 008 — allow a notification kind to fire more than once a day
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- notification_log was keyed (user_id, kind, local_day), which is exactly the
-- guarantee the two daily pushes want: claim the row, and a second cron tick
-- inside the same window cannot send again.
--
-- The settled-picks push needs the opposite — several a day, spaced out. Adding
-- the time bucket to the key gives both behaviours from one table:
--
--   big_game / daily_digest   slot is always 0  -> once per local day, unchanged
--   settled                   slot = hour / 3   -> at most one per 3-hour bucket
--
-- The bucket IS the throttle. No "last sent" arithmetic to get wrong, and two
-- overlapping cron runs still cannot double-send, because the second insert
-- collides on the key exactly as before.

alter table notification_log add column if not exists slot smallint not null default 0;

-- Existing rows all default to slot 0, so the once-a-day kinds keep the key
-- they already had.
alter table notification_log drop constraint if exists notification_log_pkey;
alter table notification_log add primary key (user_id, kind, local_day, slot);
