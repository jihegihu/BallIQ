-- Migration 004 — manual winner override for knockout ties
-- Run in Supabase: SQL Editor → New query → paste → Run. Idempotent.
--
-- The Odds API scores endpoint only reports goal totals, so a knockout game
-- decided on penalties shows as a level score (e.g. 1–1) with completed=true.
-- This column lets an admin record the team that actually advanced; the
-- resolver then credits moneyline picks to that side instead of pushing them.
-- 'home' | 'away' | null. Only meaningful for games that finished level.

alter table matches add column if not exists result_winner text;
