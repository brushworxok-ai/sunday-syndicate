# Sunday Syndicate

A responsive NFL pick ’em league built with React, Vite, Express, and the official Google GenAI JavaScript SDK.

## Gemini features

- **League recap** — turns the current pot, entries, posted results, and standings into a shareable commissioner update.
- **Pick-sheet review** — checks completeness, selection patterns, scheduling, and tiebreaker readiness without inventing live sports information.
- **Trash-talk assist** — drafts short, friendly banter grounded in the league standings; the user reviews it before posting.

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
- server-validated pick submission and result verification
- player-controlled SMS channel and trash-talk levels with immutable consent records
- private non-cash side-bet proposal, acceptance/decline, term locking, and verified score settlement
- grounded recap generation, moderation, commissioner editing/approval, and send gating
- individualized SMS delivery records, one retry, consent suppression, carrier failure capture, and in-app fallback
- signed, server-side commissioner sessions instead of a client-only password comparison
- signed, server-side player sessions backed by salted PIN hashes; players can mutate only their own consent and bet responses
- rate limiting, security headers, server-only provider keys, and Twilio webhook signature checks

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

- The **Demo proof** tab opens with a versioned four-player Week 12 acceptance scenario. It includes an approved recap, consent preferences, moderation decisions, accepted/declined side bets, delivery receipts, one failed SMS, an in-app fallback, and a timestamped audit trail.
- Local application records persist in `work/sunday-syndicate.sqlite`; Vercel records persist in Neon. **Reset demo data** restores the verified scenario.
- In local development only, the commissioner password falls back to `admin123` when `ADMIN_PASSWORD` is absent. Production requires an explicit password and stores the signed session in an HttpOnly, SameSite cookie.
- Demo player PINs are the last four visible digits on the masked phone: Marcus `0142`, Jordan `0188`, Taylor `0165`, and Chris `0199`. They are stored as salted scrypt hashes. Replace PIN login with real phone OTP or an identity provider before production.
- The schedule is still the static Week 12 / 2025 sample supplied in the prototype. A production league would store users and picks in a database and authenticate commissioner actions on the server.
- SMS defaults to a deterministic `Twilio demo adapter`; it does not contact a carrier. Set `SMS_PROVIDER=twilio` only after configuring the full Twilio environment, verified E.164 player numbers, webhooks, sender registration, and messaging consent.

## Production messaging variables

These are intentionally not needed by the demo. A production provider adapter should read them only on the server:

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
