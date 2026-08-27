# Sunday Syndicate — demo league acceptance proof

Date verified: August 13, 2026  
Scenario: Week 12 / 2025 deterministic demo fixture

## Outcome

The app now ships with a visible **Demo proof** screen and a versioned four-player league fixture. It demonstrates the complete safe path:

```text
14 verified results
? deterministic standings and awards
? grounded recap facts
? Gemini-compatible recap fixture
? per-player roast consent and moderation
? commissioner approval
? individualized broadcast delivery
? provider receipt / suppression / failure handling
? in-app fallback
? audit history
```

The implementation also proves the side-bet path:

```text
proposal ? accept or decline ? lock accepted terms
? wait for verified result ? deterministic settlement
? participant-only outcome and audit record
```

## Acceptance evidence

| Requirement | Fixture evidence | Enforcement evidence | Result |
|---|---|---|---|
| At least four players | Marcus Reed, Jordan Lee, Taylor Brooks, Chris Morgan | `DEMO_PLAYERS` and visible consent matrix | Pass |
| Weekly result recap | Approved Week 12 recap based on 14 finalized games | Stored fact snapshot, moderation status, approval timestamp | Pass |
| Trash-talk opt-out | Chris has `trashTalk.level = none` | Chris roast candidate blocked as `player_opted_out` | Pass |
| Maximum roast opt-in | Taylor has `trashTalk.level = maximum` | Game-only weather joke allowed; private-life joke separately blocked | Pass |
| Accepted side bet | Marcus vs Jordan, 25 virtual tokens | Terms locked on acceptance; Marcus wins 12–11 from verified standings | Pass |
| Declined side bet | Taylor vs Chris, bragging-rights stake | No locked terms, winner, or settlement created | Pass |
| Failed SMS | Jordan receives simulated provider error `30003` | Retry pauses; approved recap delivered to in-app fallback | Pass |
| Messaging consent | Chris sent STOP / SMS consent inactive | Suppressed before the provider adapter is called | Pass |
| Moderation | Three roast candidates: one allowed, two blocked | Consent, tone, and sensitive-topic policy evaluated in code and server runtime | Pass |
| Admin control | Auto-send off; approval required; league tone cap; audit trail | Broadcast timestamp is after explicit recap approval | Pass |

## 1. Honest assessment

Before this pass, the app had pick sheets, local scoring, local chat, a basic commissioner password, and server-side Gemini text generation. It did **not** have a player consent model, phone verification state, provider delivery records, failed-message fallbacks, side bets, moderation evidence, admin approval gates, or an auditable demo scenario.

This pass implements those behaviors as a deterministic product demo and testable domain model. It does **not** send real SMS, persist to a production database, authenticate real users, verify real phone numbers, or move money. The seeded recap is explicitly labeled `gemini_demo_fixture`; live Gemini generation remains available when `GEMINI_API_KEY` is configured. A real Twilio adapter and production storage are still required before external messaging.

## 2. Recommended messaging architecture

Use a hybrid model:

- **Individual broadcast SMS** for concise result notifications. Every recipient gets an independent consent decision, provider request, delivery receipt, retry state, and fallback.
- **In-app group chat** as the shared conversation and reply surface. This preserves history, moderation, identity, and privacy controls without exposing every phone number.
- **In-app inbox fallback** when an approved SMS fails or a player prefers no SMS.

Do not present ordinary broadcast SMS as a native carrier group. Twilio states that non-chat participants in a normal Conversation receive blast-style messages and do not experience a group-style thread; group MMS is a separate feature with regional and participant constraints. Group MMS is therefore an optional future mode for small US/Canada leagues, not the default. [Twilio Conversations limits](https://www.twilio.com/docs/conversations-classic/conversations-limits) and [group texting constraints](https://www.twilio.com/docs/conversations-classic/group-texting).

For production, create a Twilio Messaging Service with a sender pool, a delivery status callback, and inbound webhook handling. Twilio Messaging Services provide asynchronous delivery statuses and Advanced Opt-Out support. [Twilio Messaging Services](https://www.twilio.com/docs/messaging/services) and [outbound status callbacks](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks).

## 3. Gemini integration

Gemini handles language, not carrier delivery. The current safe boundary is:

- Server calculates scores, rankings, awards, side-bet outcomes, and eligible roast targets.
- Gemini receives a sanitized fact snapshot and explicit consent constraints.
- Gemini may add recap color and game-only jokes.
- Server moderation rejects sensitive/private topics and trash talk naming opted-out players.
- Commissioner sees and approves the final copy before broadcast.
- The messaging adapter receives only approved copy and eligible delivery records.

The API key remains server-side in `GEMINI_API_KEY`; it is never bundled into React. The official Google GenAI SDK is used.

## 4. External services and setup

Implemented now:

- React product UI and proof board
- Express Gemini proxy
- deterministic results, consent, moderation, settlement, delivery, and audit models
- Twilio-shaped demo adapter with success, suppression, failure, retry, and fallback states

Still required for production:

- `GEMINI_API_KEY` and optional `GEMINI_MODEL`
- Twilio account, API key/secret, Messaging Service SID, sender registration/compliance, status callback, inbound webhook, and signature verification
- database such as PostgreSQL
- real authentication and role authorization
- phone OTP verification
- HTTPS deployment and scheduled job/queue infrastructure

Twilio Advanced Opt-Out can surface `START`, `STOP`, and `HELP` events through `OptOutType`; the application must store those changes and must not send another application reply when Twilio has already handled the confirmation. [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out).

## 5. Data model

The implemented fixture covers these entities and relationships:

- `league`: messaging mode, tone cap, auto-send and approval policy
- `players`: identity, masked phone, verification timestamp, prior rank
- `messaging`: channel, consent state, consent/opt-out timestamps
- `trashTalk`: per-player tone level and update timestamp
- `sheets`, `games`, `results`: source data for deterministic scoring
- `leaderboard`: rank, score, previous rank, movement
- `recap`: fact snapshot, generation source/status, moderation results, approval, final copy
- `broadcast`: approved recap reference and per-recipient delivery records
- `sideBets`: creator, opponent, terms, non-cash stake, visibility, acceptance lock, verified settlement
- `auditLog`: timestamped workflow events

Production tables should use immutable consent records and bet-term versions rather than overwriting history.

## 6. Main screens and user flows

- **Home:** verified week status, pot, entries, approved recap.
- **Pick sheet:** submission, payment confirmation, tiebreaker, Gemini sheet review.
- **Standings:** deterministic scores from posted game winners.
- **Demo proof:** consent matrix, recap ledger, moderation decisions, delivery receipts, side-bet outcomes, and audit trail.
- **Gemini AI:** recap generation, sheet review, and trash-talk entry points.
- **Chat:** in-app shared conversation and review-before-post AI draft.
- **Admin:** result entry and rollover controls; the proof board exposes the target messaging/tone approval policy.

## 7. Personality and moderation policy

Allowed:

- game-only competitive humor
- congratulations, close-win comments, fictional scoreboard jokes
- name-based teasing within the target player’s chosen level and league cap

Blocked:

- any name-based joke about a player at `none`
- content exceeding player or league tone limits
- slurs, hate, threats, harassment, sexual content
- family, health, appearance, finances, employment, home, vehicle, or other private-life targets
- factual accusations or unsupplied claims

The demo makes the policy observable: Taylor’s weather joke passes; a Chris joke is blocked by consent; a Taylor vehicle joke is blocked as a private/sensitive topic.

## 8. Side-bet design and limits

The product supports social, participant-only proposals with accept/decline states, immutable accepted terms, expirations, and settlement from verified app records. Default stakes are virtual tokens or bragging rights. The app does not collect, transfer, enforce, or custody money.

Real-money wagering is out of scope and would require separate legal analysis, licensing, age and identity verification, geolocation, payments, tax reporting, responsible-gaming controls, and jurisdiction-by-jurisdiction compliance.

## 9. Admin controls

The demo policy is explicit:

- auto-send off
- commissioner approval required
- league tone cap set to maximum
- individual broadcast SMS mode
- delivery history and error code preservation
- one-retry policy with in-app fallback
- immutable moderation and settlement events in the audit trail

Production work must add authenticated admin roles, mutable player management, complaint handling, manual correction workflows, signed webhooks, and durable retry queues.

## 10. Test plan and results

Automated verification:

- production Vite build
- prompt sanitization and unsupported-action rejection
- runtime Gemini moderation for opted-out names and private topics
- four-player fixture and grounded winner/score facts
- per-player trash-talk consent and league tone enforcement
- SMS consent suppression before provider access
- failed SMS retry/fallback behavior
- accepted bet term lock and verified settlement
- declined bet non-settlement
- recap moderation and approval ordering

Result after the full application build: **19 tests passed, 0 failed**. Tests cover the complete injectable Gemini service boundary, SQLite local persistence and immutable consent records, salted player credential verification, the end-to-end recap/approval/broadcast/fallback workflow, and creation/locking/settlement of new non-cash side bets. The same acceptance fixture was also migrated to Neon Postgres and verified through the production API.

Visual verification:

- production build rendered in the in-app browser
- desktop proof-board inspection
- 390×844 responsive inspection
- no document-level horizontal overflow at the mobile breakpoint
- zero browser console warnings/errors

## 11. Implementation roadmap

1. Add PostgreSQL migrations and repository layer for the demonstrated entities.
2. Add real player/admin authentication and server-side roles.
3. Add phone OTP verification and immutable consent history.
4. Implement the Twilio Messaging Service adapter, signed inbound/status webhooks, STOP synchronization, idempotency, and queue-based retries.
5. Replace fixture recap generation with structured Gemini output plus fact/schema validation and moderation review.
6. Add side-bet create/accept/decline/counter UI and server commands.
7. Add scheduled weekly workflow, complaints, manual corrections, retention controls, and operational dashboards.
8. Complete messaging compliance review before production traffic.

## 12. Code changes and remaining input

Added or changed:

- versioned demo league domain fixture and pure result/settlement/moderation/delivery functions
- proof-board UI and responsive styles
- server-side Gemini moderation gate
- consent-aware prompt context
- 16 acceptance/runtime/service/workflow/auth tests, bringing the total to 19
- README production messaging setup notes

Still needed from the owner:

- add the Gemini key to `.env` to test a real model response
- choose and configure the Twilio account, sender type, Messaging Service, and webhook domain
- approve consent language, retention policy, league rules, and escalation/moderation policy
- choose production hosting, database, and identity provider

The current demo proves the application logic and fallback states without contacting players or a carrier.
