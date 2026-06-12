-- Migration 003 — house bot
-- Creates "BallIQ Baseline", a bot that always picks the moneyline favorite.
-- It gives the leaderboard a benchmark from day one: beat the bot = you're
-- adding skill beyond "just pick favorites".
-- The sync-odds cron places its picks automatically; resolution treats it
-- like any other user. Safe to run multiple times.

insert into users (
  clerk_id, username,
  global_elo, season_elo, xp_total, total_picks, weeks_active, current_streak,
  nba_elo, nfl_elo, mlb_elo, ncaa_elo, soccer_elo, tennis_elo
)
values (
  'bot_baseline', 'BallIQ Baseline',
  1200, 1200, 0, 0, 1, 0,
  1200, 1200, 1200, 1200, 1200, 1200
)
on conflict (clerk_id) do nothing;
