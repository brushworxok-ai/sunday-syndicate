# Sunday Syndicate — full-build handoff

Date: August 13, 2026

## Delivered

Sunday Syndicate is now a multi-week full-stack NFL pick ’em application with:

- the complete 18-week 2026 regular-season schedule, week selector, and bye-team display;
- DST-safe Eastern kickoff timestamps and server-enforced weekly entry locking;
- season/week-scoped entries, standings, game results, Gemini recaps, and side bets;
- a signed-in, server-grounded Gemini league assistant with privacy protection and a verified fallback;
- an automatic weekly winner ceremony with confetti, reduced-motion support, and a demo preview;
- signed player sessions and account balances backed by an immutable entry-credit ledger;
- atomic $20 weekly entry debits and duplicate-entry protection;
- commissioner-confirmed $20 weekly payment claims with pending, confirmed, and rejected states;
- protected per-player entry balances and weekly paid-sheet status;
- lifetime wins, perfect-sheet counts, winnings owed, and winnings paid;
- verified weekly settlement with a 2× perfect-sheet payout and auditable external payout confirmation;
- native group-chat sharing with a clipboard fallback, final-result gating, perfect-sheet payout copy, and season/week deep links;
- consent-aware SMS recap links that open the matching results screen and lead players into the shared in-app conversation;
- optional Stripe-hosted Checkout using a server-only restricted key and signed, idempotent webhooks;
- a SportsDataIO score adapter, 60-second stale-cache polling, final-result verification, and visible manual/error fallback states;
- preserved Week 12 / 2025 acceptance proof for consent, moderation, side-bet settlement, failed SMS, and in-app fallback;
- Neon Postgres for hosted storage and SQLite for local development/tests.

## Funding boundary

Account credits are non-transferable, have no cash value, cannot be withdrawn, and are separate from side-bet tokens. The app defaults to `PAYMENTS_PROVIDER=demo`, so no money is charged.

Real Stripe Checkout must stay disabled until legal counsel and the processor approve the league model and operating jurisdictions. When approved, configure:

```dotenv
PAYMENTS_PROVIDER=stripe
STRIPE_RESTRICTED_KEY=rk_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_BASE_URL=https://your-domain.example
```

Register `/api/webhooks/stripe` for `checkout.session.completed`. The server verifies the signature, validates the amount against the saved funding session, and posts the credit only once per Checkout Session ID.

## Live-score setup

The scoreboard works without an external provider by showing the official schedule plus commissioner-entered finals. Automatic synchronization requires:

```dotenv
SCORES_PROVIDER=sportsdataio
SPORTSDATAIO_API_KEY=your_server_only_key
```

Provider errors are stored as sync status, while the last known score remains visible. Final provider scores receive a source and verification timestamp before affecting standings or recaps.

## Verification

- Production Vite build passes.
- 31 automated tests pass, 0 fail, including pending-payment isolation, commissioner confirmation, duplicate-claim rejection, finance summaries, idempotent weekly settlement, permanent win history, the perfect-sheet 2× payout, group-share formatting, and deep-link generation.
- The original four-player consent/messaging/moderation acceptance scenario still passes.
- Schedule validation confirms 18 weeks, 272 unique games, and 17 appearances per team.
- Kickoff locking is tested using absolute instants across Eastern/Central time.
- Funding tests prove approved bundle validation, idempotent posting, atomic entry debit, and duplicate weekly-entry rejection.
- Live-score tests prove explicit fallback behavior and SportsDataIO final-score normalization.
- Production compilation and server syntax checks pass. Automated coverage verifies the player ledger, commissioner-confirmed payment flow, weekly payout settlement, and the existing schedule/scoreboard behavior.
- The 390×844 layout has no document-level horizontal overflow.
- No new browser errors appeared after the final reload.

## Deployment status

The local application and build artifacts contain the completed upgrade. The folder remains linked to the `sunday-syndicate` Vercel project, but the Vercel CLI session on this computer is logged out. The production deployment therefore still needs one authenticated command:

```powershell
npm.cmd exec --cache .npm-cache --yes --package=vercel@latest -- vercel login
npm.cmd exec --cache .npm-cache --yes --package=vercel@latest -- vercel deploy --prod --yes
```

Before deployment, add `SCORES_PROVIDER` and `SPORTSDATAIO_API_KEY` in Vercel if live scores are desired. Leave `PAYMENTS_PROVIDER=demo` until payment/legal approval; Stripe variables are not required for the safe demo-credit workflow.

## Remaining production decisions

- Replace demo PINs with OTP or a production identity provider.
- Obtain SportsDataIO NFL Scores access and set the server-only key.
- Complete legal and processor review before enabling real entry-fee checkout.
- Configure Twilio only after sender registration, consent language, and webhook setup are complete.
- Add scheduled background score synchronization if the league grows beyond client-driven 60-second refreshes.
