# 405 Badguys Parlay

A responsive NFL pick ’em league built with React, Vite, Express, and the official Google GenAI JavaScript SDK.

## Gemini features

- **League recap** — turns the current pot, entries, posted results, and standings into a shareable commissioner update.
- **Pick-sheet review** — checks completeness, selection patterns, scheduling, and tiebreaker readiness without inventing live sports information.
- **Trash-talk assist** — drafts short, friendly banter grounded in the league standings; the user reviews it before posting.

The browser calls the local `/api/gemini` endpoint. The Express server holds the API key and constructs constrained prompts, so `GEMINI_API_KEY` is never included in the client bundle.

## Run locally

Requires Node.js 22.13+; Node.js 24 LTS is recommended because local development uses the built-in SQLite module.

1. Install dependencies:

   ```powershell
   npm.cmd ci
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
   CRON_SECRET=choose_a_different_long_random_value
   ```

4. Start the web app and API together:

   ```powershell
   npm.cmd run dev
   ```

5. Open `http://localhost:5173`.

The default model can be changed with `GEMINI_MODEL`. The app remains usable when Gemini is unconfigured: weekly recap commands use a deterministic, fact-only fallback and ad-hoc AI actions show setup guidance.

## Implemented application workflows

- Neon Postgres-backed hosted records, with SQLite retained for zero-configuration local development and tests
- server-validated pick submission and result verification
- player-controlled SMS channel and trash-talk levels with immutable consent records
- private non-cash side-bet proposal, acceptance/decline, term locking, and verified score settlement
- grounded recap generation, moderation, commissioner editing/approval, and send gating
- individualized SMS delivery records, one retry, consent suppression, carrier failure capture, and in-app fallback
- signed, server-side commissioner sessions instead of a client-only password comparison
- signed, server-side player sessions backed by salted PIN hashes; players can mutate only their own consent and bet responses
- rate limiting, security headers, server-only provider keys, and Twilio/Telnyx webhook signature checks
- identity-scoped league responses: private picks, phones, payment state, chat, payouts, and admin records never cross the wrong HTTP boundary
- atomic, idempotent weekly payouts with correct co-winner splits
- one verified service worker for offline navigation and push notifications

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

Set `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET` in every deployed environment. Production startup fails closed when any required secret is missing. Set `GEMINI_API_KEY` only in the hosting provider's encrypted environment; the app never stores API keys in its database. Configure a real SMS provider before opening registration because deployed registration requires a one-time phone code.

Run the full release gate before deploying:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd audit --omit=dev
```

## Demo notes

- The **Demo proof** tab opens with a versioned four-player Week 12 acceptance scenario. It includes an approved recap, consent preferences, moderation decisions, accepted/declined side bets, delivery receipts, one failed SMS, an in-app fallback, and a timestamped audit trail.
- Local application records persist in `work/sunday-syndicate.sqlite`; Vercel records persist in Neon. **Reset demo data** restores the verified scenario.
- In local development only, the commissioner password falls back to `admin123` when `ADMIN_PASSWORD` is absent. Production requires an explicit password and stores the signed session in an HttpOnly, SameSite cookie.
- Demo player PINs are the last four visible digits on the masked phone: Marcus `0142`, Jordan `0188`, Taylor `0165`, and Chris `0199`. They work only in local development. Deployed builds reject seeded credentials; new players verify their phone and create a six-digit PIN.
- The repository contains the 2026 NFL schedule used by the pick and lock workflows. Scores are synchronized through the server and every result used for settlement is recorded as verified data.
- SMS defaults to a deterministic demo adapter and does not contact a carrier. Configure Telnyx, Twilio, or Textbelt only after sender registration, verified E.164 numbers, live webhooks, and messaging-consent review.

## Production messaging variables

These are intentionally not needed by the demo. Provider secrets are read only on the server:

```dotenv
TWILIO_ACCOUNT_SID=
TWILIO_API_KEY=
TWILIO_API_SECRET=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_STATUS_CALLBACK_URL=https://your-domain.example/api/webhooks/twilio/status
TWILIO_INBOUND_WEBHOOK_URL=https://your-domain.example/api/webhooks/twilio/inbound
APP_BASE_URL=https://your-domain.example
SMS_PROVIDER=twilio
```

Use Twilio API keys in production rather than placing an Account Auth Token in application configuration. Validate webhook signatures, keep STOP/START consent records synchronized, and never send when the local consent record is inactive.

For Telnyx, set `SMS_PROVIDER=telnyx`, `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, and `TELNYX_PUBLIC_KEY`. The public key is mandatory: inbound and delivery-status webhooks are rejected unless their Ed25519 signature and timestamp validate.
