-- migration-007: free game details from ESPN's public scoreboard endpoints
-- (team records, venue, broadcast). Populated best-effort during odds sync;
-- all nullable — the UI renders nothing when absent.

alter table matches
  add column if not exists home_record text,   -- e.g. "12-4"
  add column if not exists away_record text,
  add column if not exists venue       text,   -- e.g. "TD Garden"
  add column if not exists broadcast   text;   -- e.g. "ESPN"
