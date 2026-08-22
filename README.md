# 405 BADGUYS PARLAY

A responsive NFL pick ’em league built with React, Vite, Express, and the official Google GenAI JavaScript SDK.

## Gemini features

- **League recap** — turns the current pot, entries, posted results, and standings into a shareable commissioner update.
- **Pick-sheet review** — checks completeness, selection patterns, scheduling, and tiebreaker readiness without inventing live sports information.
- **Trash-talk assist** — drafts short, friendly banter grounded in the league standings; the user reviews it before posting.
- **Jack, the league host** — gives signed-in players a multi-turn chat for verified standings, rules, schedule status, their own entry credits, and app navigation. Gemini powers Jack on the server; the app withholds hidden picks, other players' account data, odds, and unverified sports claims.

The browser calls the local `/api/gemini` endpoint. The Express server holds the API key and constructs constrained prompts, so `GEMINI_API_KEY` is never included in the client bundle.

## Run locally

Requires Node.js 22.13+; Node.js 24 LTS is recommended because the server uses the built-in SQLite module.

1. Install dependencies:

   ```powershell
   npm.cmd install --cache .npm-cache
   ```

2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Add a Gemini API key from Google AI Studio to `.env`:

   ```dotenv
   GEMINI_API_KEY=your_real_key
   ADMIN_PASSWORD=choose_a_unique_password
   SESSION_SECRET=choose_at_least_32_random_characters
   ```

4. Start the web app and API together:

   ```powershell
   npm.cmd run dev
   ```

5. Open `http://localhost:5173`.

The default model can be changed with `GEMINI_MODEL`. The app remains usable when Gemini is unconfigured: weekly recap commands use a deterministic, fact-only fallback and ad-hoc AI actions show setup guidance.

## Implemented application workflows

- Neon Postgres-backed hosted records, with SQLite retained for zero-configuration local development and tests
- official 18-week 2026 schedule navigation, bye display, and DST-safe server kickoff locks
- all 32 club identities with verified NFL-hosted logo URLs, team-color fallbacks, and responsive matchup/scoreboard presentation
- season/week-scoped pick submission, standings, recaps, side bets, and result verification
- signed-in player account credits with an immutable ledger and atomic $20 weekly entry debit
- player-submitted “payment sent” claims that remain pending until commissioner confirmation, with rejection handling and immutable audit records
- a protected commissioner finance desk showing every player’s confirmed entry balance, weekly payment state, sheet status, wins, perfect sheets, and winnings owed/paid
- idempotent weekly payout settlement from verified results, including closest-without-going-over tiebreakers, rollover handling, permanent win history, and an automatic 2× payout for a perfect sheet
- optional Stripe-hosted Checkout with restricted server key support and signed, idempotent webhooks
- optional no-key current-season ESPN scoreboard synchronization with shared caching, provider error capture, and manual fallback
- timestamped ESPN NFL headline watch with injury-story detection, favorite-team prioritization, source links, saved-data fallback, and grounded Jack answers
- player-controlled Web Push alerts and trash-talk levels with immutable consent records
- private non-cash side-bet proposal, acceptance/decline, term locking, and verified score settlement
- a friendly-wager menu with score-duel, temporary chat-crown, tiebreaker-duel, and randomized challenge presets
- grounded recap generation, moderation, commissioner editing/approval, and send gating
- authenticated Gemini league-assistant chat with bounded history, server-grounded context, privacy filtering, and a verified local fallback
- Jack’s strictest-limit roast engine: platform safety → commissioner ceiling → player consent, with Clean, PG-13, Explicit Adult, and Commissioner’s Target modes
- player-owned adult consent, commissioner per-player limits, winner immunity, grounded message preview, and auditable Jack policy changes
- structured season memory for records, streaks, best/worst weeks, favorite-team results, rivalries, prior seasons, and titles
- automatic favorite-team matchup detection, verified player-vs-player bragging-rights records, and consent-capped rivalry copy that protects No Roast Mode
- a separate optional $25 season reward ledger with player claims, commissioner confirmation, a visible confirmed pot, Week 1 lock, Week 18 settlement, equal-leader splits, and permanent payout history
- nine responsive Jack avatar states plus captions, volume, speed, text-only, static, and reduced-motion experiences
- an optional authenticated, rate-limited server TTS endpoint for an original designed ElevenLabs voice; browser speech remains the no-key fallback
- automatic once-per-week winner ceremony with confetti, a demo preview, keyboard dismissal, and reduced-motion support
- a home-page ceremony preview with animated crown, rotating victory rays, score, purse, and a direct victory-lap shortcut
- individualized Web Push delivery records, consent suppression, expired-device cleanup, and in-app fallback
- final-only **Share recap** controls that open the device’s native share menu and fall back to a copy-ready message on desktop
- compact weekly share copy containing the winner, perfect-sheet 2× payout, standings, and deep links to the correct results and league-chat views
- approved Web Push recaps that automatically include a season/week-specific results link while retaining per-player consent and delivery receipts
- signed, server-side commissioner sessions instead of a client-only password comparison
- signed, server-side player sessions backed by salted PIN hashes; production accepts only commissioner-issued private six-digit PINs, and rotating a PIN invalidates older sessions
- rate limiting, security headers, server-only VAPID private keys, and player-authenticated subscription endpoints

## Verify

```powershell
npm.cmd run check
```

## Vercel deployment

The repository includes a Vercel Vite build and an Express catch-all Function under `api/`.
Hosted deployments use a Vercel-managed Neon Postgres database. League records are stored as
versioned JSONB aggregates with optimistic concurrency checks, so consent, recap, bet, delivery,
and audit updates survive Function restarts without lost-update races.

After linking the Vercel project, provision and initialize storage with:

```powershell
vercel.cmd env pull .env.local --yes
npm.cmd run db:migrate
npm.cmd run db:seed
```

## Demo notes

- The **Jack demo** is a guided, deterministic product tour. Open `/?view=join&invite=405JACK` to test invite verification, demo account creation, favorite-team and humor-consent capture, and Jack’s onboarding message. Open `/?view=join&invite=405JACK&stage=league` to jump directly to the four-player intelligence lab: four distinct favorite teams, all four roast settings, verified 2025 fixture records, a simulated live-score swing, a simulated major injury update, an editable voice question, a history-aware recap, and the unavailable-data fallback. It never creates a real account, loads a real NFL feed, stores audio, moves money, or finalizes a winner.
- The **Demo proof** tab opens with a versioned four-player Week 12 acceptance scenario. It includes an approved recap, consent preferences, moderation decisions, accepted/declined side bets, delivery receipts, one failed SMS, an in-app fallback, and a timestamped audit trail.
- Local application records persist in `work/sunday-syndicate.sqlite`; Vercel records persist in Neon. **Reset demo data** is available only in local development so production league records cannot be overwritten.
- In local development only, the commissioner password falls back to `admin123` when `ADMIN_PASSWORD` is absent. Production requires an explicit password and stores the signed session in an HttpOnly, SameSite cookie.
- Local development keeps the historical four-digit demo PIN fixture for automated acceptance testing. Production rejects those credentials. The commissioner must use **Admin → Player access** to rename roster placeholders and issue each player a private six-digit PIN; the app stores only salted scrypt hashes and never returns the PIN. A managed identity provider remains an optional future upgrade for a larger public league.
- The **Demo proof** remains the historical Week 12 / 2025 acceptance fixture. Operational pick sheets use the complete 2026 regular-season schedule and store season/week on every new entry.
- The failed-SMS row is a deterministic historical acceptance fixture only; production broadcasts use optional Web Push plus an in-app fallback and do not contact Twilio or a carrier.

## Commissioner-confirmed weekly payments

The primary player workflow is now manual and auditable:

1. The player sends the $20 weekly entry directly to the commissioner using the league’s agreed external method.
2. The player signs in, opens **Payments & winnings**, and taps **I sent $20** for that specific season/week.
3. The claim remains pending and does not increase the player’s entry balance.
4. The commissioner opens **Admin → Payment desk** and confirms or rejects the claim.
5. A confirmed payment adds one $20 entry credit; locking the sheet atomically consumes it and marks the sheet paid.

The same account screen separates entry balance from winnings. After all results are verified, the commissioner settles the week. A normal winner is owed the weekly pot; a perfect sheet is owed twice the base pot. Marking the external payout paid preserves the win, amount, perfect-sheet flag, and payout timestamp without treating prize money as spendable entry credit.

The optional processor-backed funding endpoint remains available for future approved use, but it is no longer the primary player interface.

## Optional $25 season reward

The season reward is deliberately separate from weekly funding and spendable entry credits:

1. Before the first Week 1 kickoff, a signed-in player sends $25 to the commissioner outside the app and marks the contribution sent.
2. The contribution stays pending until the commissioner confirms receipt in **Admin → Season reward desk**.
3. Confirming it adds the player to the eligible season pool but never credits or debits the weekly account ledger.
4. Commissioner-settled weekly winners build the season race. After Week 18 is settled, the confirmed entrant with the most weekly wins earns the extra pot; equal leaders split it exactly.
5. The commissioner pays the winner outside the app and marks the payout paid, preserving the contribution count, leaders, shares, and timestamps.

The app does not collect, hold, transfer, or automatically pay this money and does not determine whether a pool is permitted in a particular jurisdiction. Obtain local legal guidance before using the feature.

Do not enable real-money checkout until both legal counsel and the payment processor approve the league model and every operating jurisdiction. Stripe may restrict gambling, prize, stored-value, or money-transmission activity. When approved, configure server-only credentials in Vercel:

```dotenv
PAYMENTS_PROVIDER=stripe
STRIPE_RESTRICTED_KEY=rk_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_BASE_URL=https://your-domain.example
```

Register `https://your-domain.example/api/webhooks/stripe` for `checkout.session.completed`. The app verifies the webhook signature and posts funding once by Checkout Session ID. It never puts a Stripe secret in the browser and does not request card-only payment methods.

Other potential rails are deliberately presented as a compliance-gated roadmap, not as active buttons. Gaming-specialist providers such as Trustly, Nuvei, and Worldpay can support Pay by Bank, cards, and wallets for approved operators. A commissioner-confirmed cash/check/offline workflow can also post auditable credits after verification. Do not use personal Venmo, Cash App, PayPal, Square, or misleading payment descriptions to bypass a provider's gambling or prize restrictions.

## Team identity assets

Club logos load from the NFL's public static asset host and fall back to a team-color monogram if an image is unavailable. The app is an unofficial fan league; NFL and club names, marks, logos, and uniform designs remain the property of their respective owners. Obtain appropriate trademark permission before any public commercial launch.

## Live scores

The scoreboard always works in a visible fallback mode using scheduled games and commissioner-verified finals. To enable automatic NFL score synchronization:

```dotenv
SCORES_PROVIDER=espn
```

The no-key adapter reads ESPN's public current-season NFL scoreboard, caches it on the server, and falls back to the last saved or commissioner-entered score if the unofficial response changes or becomes unavailable. On Windows, double-click `SETUP-LIVE-SCORES.cmd` to enable the provider, redeploy, and verify production. API-Sports remains supported using `SCORES_PROVIDER=api_sports` and `API_SPORTS_KEY`, but its free NFL plan currently exposes historical seasons rather than the 2026 live season. SportsDataIO remains supported as an optional paid provider.

To avoid unnecessary bandwidth, the server makes one atomic shared request about every 2 minutes during active games, every 15 minutes while waiting, and every 30 minutes after finals; simultaneous phones cannot multiply upstream calls. The adapter normalizes team codes to schedule game IDs, verifies final winners, and preserves the last known scores during an outage. This unofficial feed has no service guarantee, so manual commissioner finals always remain available.

The same cached response supplies a small ESPN NFL headline watch. Injury-related stories are detected from the published headline and description, labeled as **Injury Watch**, prioritized for the signed-in player's favorite team, and stored with their source link and published time. This is intentionally presented as headline reporting—not a complete official injury report or medical advice. Jack can summarize only those saved articles and must say when no relevant fresh headline is available.

The Jack intelligence lab uses deterministic fixture data so the acceptance flow is repeatable. Production injury and roster intelligence is a separate expansion: keep the provider key server-only, normalize player/team IDs before Gemini sees them, show source and freshness timestamps, and retain the last verified snapshot when a feed is unavailable. See `outputs/jack-intelligence-lab-audit.md` for the provider, cache, consent, voice, privacy, and rollout plan.

## Production messaging variables

These are intentionally not needed by the demo. A production provider adapter should read them only on the server:

```dotenv
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=https://your-domain.example
APP_BASE_URL=https://your-domain.example
```

Generate the VAPID pair once, keep the private key server-side, and publish only the public key through `/api/push/public-key`. Players must sign in and explicitly enable alerts on each device. Revoked or expired subscriptions are removed and the approved recap remains available in-app.

The commissioner can also use **Share recap** without any messaging provider. On supported devices this opens the native share sheet for Messages, TextNow, WhatsApp, email, and other installed targets; on other browsers the formatted recap is copied for pasting. The app deliberately requires a person to choose the external conversation.

## Jack host, voice, and adult-consent controls

Open **Admin → Jack Control Booth** to set the league ceiling, profanity policy, winner celebrations, per-player commissioner limits, voice/accessibility defaults, animation behavior, and a moderated preview. Players separately set their own Jack ceiling and reversible adult-language consent under **Players**. The stricter value always wins and verified weekly winners are protected from roasting.

The browser voice needs no provider account. To enable the implemented server-side original designed-voice adapter, create a new voice from a written character description rather than cloning a person, then configure:

```dotenv
JACK_TTS_PROVIDER=elevenlabs
JACK_TTS_API_KEY=server_only_key
JACK_TTS_VOICE_ID=original_designed_voice_id
JACK_TTS_MODEL=eleven_flash_v2_5
```

Keep these variables in Vercel/server environments only. The authenticated `/api/jack/speech` endpoint rate-limits requests, bounds input, returns non-cacheable audio, and never sends a provider secret to the browser. Full architecture, permission, safety, provider, data-model, test, and rollout notes are in `outputs/jack-host-upgrade.md`.

On Windows, double-click `SETUP-JACK-VOICE.cmd` for the private one-click setup. It prompts for the key without displaying it, saves `JACK_TTS_API_KEY` as a sensitive Vercel variable for Production and Preview, redeploys the app, and checks the production voice status. The key is never written to this repository or a local environment file.
