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

The default generation model can be changed with `GEMINI_MODEL`. Interactive Jack chat uses the low-latency stable `gemini-3.5-flash-lite` model by default and can be overridden with `JACK_GEMINI_MODEL`. Ordinary league questions do not wait on the external ESPN feed; news and injury questions use a short, cache-backed lookup. The app remains usable when Gemini is unconfigured: weekly recap commands use a deterministic, fact-only fallback and ad-hoc AI actions show setup guidance.

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

## Jack voice, SMS and push verification

- Voice: set `JACK_TTS_PROVIDER=elevenlabs`, `JACK_TTS_API_KEY`, and the exact `JACK_TTS_VOICE_ID`. Jack uses that voice's saved settings. `GET /api/tts/diagnose` (commissioner session) is read-only and reports its name, category and subscription status. `POST /api/tts/diagnose` generates one short, billable audio probe. The player Listen button labels studio playback versus device fallback; Stop cancels pending synthesis too.
- Telnyx: set `SMS_PROVIDER=telnyx`, `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, and `TELNYX_PUBLIC_KEY`. Set the messaging profile's v2 webhook to `/api/sms/inbound`; this accepts inbound messages and delivery events. A separate `/api/webhooks/telnyx/status` route is also available. Unsigned requests are rejected. Jack responds to an opted-in, verified player's “Hey Jack”, “Yo Jack”, or “Ask Jack” question.
- SMS consent is explicit and versioned. Phone verification never opts a player into recurring texts. New and legacy players must check the current disclosure; all other sends are suppressed to the in-app fallback. Public disclosures are available at `/privacy.html` and `/terms.html`, and provider-bound copy is normalized to identify the program and include STOP/HELP instructions.
- A US long-code Telnyx number must be assigned to an approved 10DLC campaign. The commissioner diagnostic checks the assignment and disables test sends until it is confirmed. Registration does not override carrier content restrictions; do not misclassify or submit a prohibited campaign.
- In Commissioner → **Jack, texts & notifications**, **Check connections** is read-only. To send one deliberate test, configure your authorized `ADMIN_PHONE_E164`, check the consent box, and choose **Send one test text**. The API equivalent is POST `{ "confirm": true, "requestId": "<UUID v4>" }` to `/api/sms/test` as commissioner. Reuse that same request ID after an uncertain response; a durable claim prevents duplicate sends. Use **Check delivery status** or `/api/sms/trace?id=...` with the returned message ID. `queued` or `sent` is not handset delivery; `delivered` is the carrier receipt. Sender registration/carrier errors must be resolved in Telnyx; API credentials alone do not prove delivery.
- Group MMS uses Telnyx's dedicated endpoint and permits 2–8 recipients. All participants can see each other's numbers. Use Individual mode for privacy or larger groups.
- Push: configure a persistent `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` pair and `VAPID_SUBJECT`. In My Profile, enable push and choose **Send test notification**. Confirm the notification appears in the device's notification center. Each player can subscribe up to five devices; logout unsubscribes that device. Expired subscriptions are removed. `/api/push/diagnose` reports configured state and device counts to the commissioner without exposing endpoints or encryption keys.
- In-app notifications refresh on focus, on push receipt and every minute while visible. Seen state is per player. Final results, payouts, payment confirmations and Jack SMS replies also attempt push delivery; their in-app copies remain available when push fails.
- Scheduling limitation: `vercel.json` currently runs auto-pilot once daily at 16:00 UTC, with additional runs on league visits. This cannot guarantee every 24-hour/3-hour reminder window. Use a hosting plan or external scheduler supporting frequent authenticated calls (for example every 15 minutes) before promising precise reminders. No paid scheduler is provisioned automatically.

Deployment gate: verify the intended ElevenLabs voice name, an actual test SMS/carrier receipt, and an actual device notification after deployment. Automated tests mock providers and do not prove carrier or operating-system delivery.

## Security and account behavior

- Entry checkboxes record a payment claim, never confirmed payment. Only commissioner confirmation or the server credit-payment flow marks entries paid. Updating picks retains the same sheet ID and payment record.
- League HTTP responses hide other players' unlocked selections, payment claims, balances, contact details, draft recaps, private side bets, and provider delivery logs. Commissioner responses retain operational records but never include push credentials. Players can access only their own league's protected routes.
- Production disables seeded demo PINs. Existing real PINs continue working; PIN resets revoke existing player sessions. Commissioner sign-out is available on the operations page.
- Production cron endpoints require `CRON_SECRET`; an `x-vercel-cron` header by itself is not trusted. Sign-in attempts are rate-limited per server instance; distributed abuse protection is still recommended for internet-facing deployments.
