# BallIQ — Agent Handoff

**What it is:** A chess-style Elo sports-picks game (Next.js 16.2.6 + Clerk + Supabase + Zustand). Users predict real games and gain/lose an Elo rating. **No real money, wallets, or gambling — ever.** Wrapped for iOS via Capacitor; the native shell loads the live site (`server.url = https://balliq.dev`).

## Production state (all live)
- **Domain:** balliq.dev (Vercel), Clerk production keys, DNS verified.
- **iOS:** built on **Codemagic** (cloud CI, `codemagic.yaml`), auto-publishes to TestFlight. Bundle ID **`dev.balliq.app`**, Apple Team `7U3FWD7228`, App Store Connect ID `6785253664`.
- **Odds:** The Odds API on the **20K/month plan**. ~2.8K used as of 2026-11-10.
- **Sync:** `GET /api/sync-odds` (Bearer `CRON_SECRET`) driven by an external **cron-job.org** job. There is **no manual sync button** (removed — every sync costs API credits).

## Changed recently (this session)
- **Engagement UI:** Elo-first game cards (Elo reward is the hero, odds demoted), rating shown in games header, post-settle celebration modal (`RecapBanner`), next-tier progress bar (`EloHeader`), streak chip, rating-first onboarding, friends leaderboard hooks. Auth pages are bare (no header/nav) via `components/AppChrome.tsx`.
- **Sync hardening:** removed UI Refresh button + its `POST` handler; `GET /api/sync-odds` now hard-requires `CRON_SECRET` (503 if unset). Vercel cron kept as a daily failsafe (`vercel.json`).
- **Push notifications:** see the Notifications section below. Settlement pushes no longer fire from `sync-odds`.
  - `lib/apns.ts` — server APNs sender, Node built-ins only (http2 + ES256 JWT), no SDK. No-ops if `APNS_*` env vars unset.
  - `push_tokens` table (`supabase/migration-006-push-tokens.sql`), `POST /api/push/register`, `components/PushRegistrar.tsx` (native-only), send + dead-token pruning in `app/api/sync-odds/route.ts`.
  - iOS wiring in repo (Codemagic can't use Xcode GUI): `App.entitlements` (`aps-environment=production`), `AppDelegate` remote-notification callbacks, `CODE_SIGN_ENTITLEMENTS` in `project.pbxproj`.

## Cron jobs (cron-job.org)
Two jobs, both authenticated with `CRON_SECRET` (either `Authorization: Bearer <secret>`
or `x-cron-secret: <secret>` — see `lib/cronAuth.ts`).

| job | URL | schedule | cost |
|---|---|---|---|
| Odds sync | `GET /api/sync-odds` | `0 0-1,4,8,12-23 * * *` (16/day) | ~40 odds credits each, ≈62% of the 20K plan |
| Notifications | `GET /api/notify` | `0 * * * *` (hourly) | **zero** odds credits — Supabase + APNs only |

The notification job must run hourly even though it sends at most twice a day:
each tick is a no-op except for devices whose LOCAL clock has reached a send
window, which is how one UTC schedule serves every timezone.

## Env vars (Vercel)
`ODDS_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), Clerk keys, and push: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=dev.balliq.app`, `APNS_PRIVATE_KEY` (full .p8), `APNS_PRODUCTION=true` (TestFlight uses the production APNs env).

## What the user is currently doing / verifying
- Reports having completed: Apple Push capability on the App ID, regenerated dist profile, Codemagic rebuild, migration-006, `APNS_*` env vars.
- **Next verification step:** confirm a row appears in Supabase `push_tokens` after opening the app + allowing notifications. If missing → debug permission prompt / AppDelegate callbacks.
- Optional offered, not yet built: an admin test-push endpoint for instant push verification.

## Still open (pre-App-Store)
- **Sign in with Apple** — required *only if* the sign-in page offers Google/social login (Apple Guideline 4.8). **Unconfirmed** — check the Clerk sign-in page.
- App Store metadata: screenshots, 1024×1024 opaque icon, age rating (answer **No** to all gambling/content — skill only), category = Sports.
- Upgrade Odds API to 20K plan, then swap the cron expression back to the 10×/day schedule.

## Hard rules (do not break)
- No real money / wallets / deposits anywhere.
- `SUPABASE_SERVICE_ROLE_KEY` and `ODDS_API_KEY` are **server-side only** — never in the client bundle.
- Server validates all pick values (event Elo, lines, XP) — never trust the client.
- The Odds API free tier: `daysFrom=3` max (7 → HTTP 422).
- This is a **modified Next.js** — read `node_modules/next/dist/docs/` before using unfamiliar Next APIs (see `AGENTS.md`).
- Double-check work; end with concise next steps.

## Notifications (current)
Two pushes a day, at most, sent on each DEVICE's local clock from the hourly
`/api/notify` job. Requires `supabase/migration-007-notifications.sql`.

| kind | local time | content |
|---|---|---|
| `big_game` | 17:00–19:59 | one unpicked game worth deciding on |
| `daily_digest` | 22:00–23:59 | today's W/L and net Elo, plus rank movement |

- **"Big game" is scored**, not flagged by any feed — `lib/bigGame.ts`: odds
  closeness (0.40) + a hand-kept marquee-team list (0.35) + BallIQ pick volume
  (0.15) + broadcast (0.10). ESPN enrichment covers only ~10% of the next 24h,
  so records/broadcast are a bonus and odds carry it. Marquee strings must
  match the odds feed exactly or they score zero silently.
- **Timezone** comes from the handset on push registration and is re-sent every
  launch. Tokens registered before migration-007 read `null` and fall back to
  Eastern until the app next opens.
- **Volume is the feature.** Settlement used to push on every sync (up to 16×/day);
  the digest replaced it. A third slot is one entry in `WINDOWS` (`lib/notifyWindow.ts`).
- **One master switch** per account (`users.notifications_enabled`), toggled in
  Account, honoured server-side before any per-user work. No per-type toggles yet.
- Slots are claimed in `notification_log` **before** sending, so a crash skips a
  notification rather than duplicating one. `rank_snapshots` exists because rank,
  unlike rating, cannot be reconstructed after the fact.
