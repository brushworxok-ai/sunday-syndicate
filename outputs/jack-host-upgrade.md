# Jack Host Upgrade — product, safety, voice, and implementation handoff

Status: implemented and locally verified on August 18, 2026. The browser/system voice works without an API key. A consistent production-designed voice requires the optional server-side provider setup below.

## 1. Honest current-state audit

Before this upgrade, Jack already had server-grounded Gemini prompts, commissioner approval before recap broadcasts, four legacy humor modes, deterministic live/injury/history fixtures, a browser speech-recognition demo, browser speech synthesis, winner settlement, and an audit trail. The largest gaps were that legacy humor names were not a formal adult-content policy, admin and player settings did not resolve through one reusable rule, winner immunity was implicit, long-term memory was not normalized, voice and animation preferences were not durable, and the avatar had no shared state machine.

Now implemented:

- one shared strictest-limit resolver used by server recap logic and UI preview;
- Clean, PG-13, Explicit Adult, and Commissioner’s Target levels;
- separate player consent and commissioner assignment, with platform safety always first;
- private-space, 18+, explicit-consent, and global profanity gates for adult language;
- verified-winner recognition, co-winner handling, tiebreaker support, and winner immunity;
- normalized season memory for records, streaks, best/worst weeks, upsets, missed calls, favorite-team results, rivalries, prior seasons, and titles;
- persisted league voice/animation settings and per-player Jack policy in SQLite and Neon/Postgres;
- admin preview, per-player policy editor, recent audit view, and nine avatar states;
- browser TTS fallback plus an authenticated, rate-limited server TTS endpoint for an original designed voice;
- text-only, captions, volume, speed, reduced audio, and reduced-motion controls;
- restrained cyan/live, orange/roast, gold/winner, and red/error states on dark premium surfaces.

Not falsely claimed as complete:

- No paid TTS account or designed voice ID is present yet, so the deployed app should continue using browser speech until the commissioner selects a provider and creates an original licensed voice.
- Live NFL injuries are still a deterministic test fixture. Real injury data needs a licensed sports-data feed and stable provider player IDs.
- Admin record editing is supported by the store architecture but a general historical-record editor is a later commissioner-tooling phase; the new control booth handles Jack-specific fields.
- The current portrait is used as an existing project asset. Confirm ownership/licensing before a public commercial launch.

## 2. Admin and player permission model

The effective policy is `platform safety → commissioner settings → player consent`; the lowest allowed level wins. “Final admin control” means the commissioner may lower, disable, preview, approve, or block Jack. It does not mean the commissioner may force a player above that player’s consent.

| Control | Player | Commissioner | System |
|---|---:|---:|---:|
| Set player consent ceiling | Own account only | Cannot raise it | Enforces lowest value |
| Confirm adult consent / 18+ | Own account only | Cannot fabricate it | Required for adult level |
| Assign admin roast ceiling | View effective result | Yes | Cannot exceed player ceiling |
| Disable Jack/roast | Can disable own roast | Can disable globally/per player | Fail closed |
| Set global profanity | No | Yes | Adult only when every gate passes |
| Celebrate winner | No | Toggle globally | Winner is never roasted that week |
| Approve recap/broadcast | No | Required | Auto-send stays off |
| Voice/animation settings | Personal accessible playback in demo | League defaults | Text/static fallback always exists |

Every player consent or commissioner policy change creates a consent/audit record. PIN-authenticated players can edit only their own preferences. Admin routes require the signed commissioner session.

## 3. Roast and explicit-language policy

- **Clean:** sports facts and friendly banter; no profanity.
- **PG-13:** sharper sarcasm and mild language, still game-only.
- **Explicit Adult:** stronger game-related language after private-space, age, player-consent, admin-cap, and global-profanity checks.
- **Commissioner’s Target:** highest supported sports-roast intensity, never a no-limits mode.

Always blocked: protected traits, slurs, threats, sexual humiliation, appearance, health, family, finances, employment/private-life attacks, unsupported facts, roasting an opted-out player, and roasting a verified weekly winner. Generated text is checked against the requested level, effective level, profanity policy, target consent, and a list of available fact IDs before approval.

## 4. Player-memory and season-history model

Each player record now supports:

```text
favoriteTeam
jackPolicy {
  playerConsentLevel, adminAssignedLevel, roastEnabled,
  adultLanguageConsent, adultAgeGate, updatedAt, updatedBy
}
seasonHistory[]
```

The memory builder derives totals, correct/incorrect counts, win percentage, ordered weekly record, current and longest streaks, best/worst weeks, upset wins, missed calls, favorite-team results, rivalry outcomes, prior-season records, titles, rank, and a verified timestamp. Derived memory must be rebuilt from stored results; Jack does not fill missing history with guesses.

## 5. Weekly winner and recap logic

1. Require verified results before naming a winner.
2. Calculate the highest score from stored sheets and verified winners.
3. Preserve all co-winners unless a verified tiebreaker identifies one winner.
4. Mark winner IDs as protected before selecting any roast target.
5. Create a positive recognition message and optional celebration state.
6. Select a non-winner target only after strictest-policy resolution.
7. Generate from a bounded facts snapshot, moderate the text, require commissioner approval, then broadcast only to consenting channels.
8. If data is incomplete or unavailable, label it pending/unavailable and retain the last verified snapshot.

## 6. Voice architecture and provider options

Current zero-setup path: the browser Web Speech APIs read visible text. Audio is not uploaded or stored, and text-only mode remains available.

Production path implemented: authenticated client → `POST /api/jack/speech` → server-only TTS adapter → audio response with `private, no-store`. The endpoint is rate-limited, scripts are sanitized and limited to 1,200 characters, and provider credentials never enter the frontend bundle.

Recommended options:

1. **ElevenLabs Voice Design** — best fit for creating an original character from a written description, without submitting a real person’s recording. The server adapter is implemented for this option. Official docs: <https://elevenlabs.io/docs/eleven-creative/voices/voice-design/> and <https://elevenlabs.io/docs/overview/capabilities/text-to-speech>.
2. **Google Cloud Text-to-Speech Chirp 3 HD** — strong managed alternative with conversational HD voices and streaming/batch support. Official docs: <https://cloud.google.com/text-to-speech/docs/voices>.
3. **Azure Speech neural voices** — useful when viseme events are desired for true mouth animation; Azure documents viseme support for en-US neural voices. Official docs: <https://learn.microsoft.com/en-us/azure/ai-services/Speech-Service/text-to-speech>.

Design prompt direction: “An original adult male sports host, deep and warm, confident but conversational, subtle Southern-US rhythm, crisp diction, medium-slow pace, expressive celebration, dry comic pauses; not an imitation of any identifiable person.” Do not upload a real person’s voice unless the provider’s consent and rights requirements are satisfied.

Required variables for the implemented ElevenLabs adapter:

```dotenv
JACK_TTS_PROVIDER=elevenlabs
JACK_TTS_API_KEY=server_only_key
JACK_TTS_VOICE_ID=original_designed_voice_id
JACK_TTS_MODEL=eleven_flash_v2_5
```

## 7. Avatar animation approach

The reusable `JackAvatar` component supports idle, listening, thinking, talking, roast, winner, shock, live, and error states. CSS-only scan, aura, waveform, processing dots, and winner pop effects avoid heavy video/Lottie downloads. The state remains readable in static mode. Both the OS `prefers-reduced-motion` setting and Jack’s explicit reduced-motion setting stop motion while preserving color, label, and status.

The current talking state is an expressive waveform simulation. True phoneme mouth movement is a later enhancement and should consume provider viseme/timestamp data rather than guessing from raw audio.

## 8. Visual design upgrades

The control booth and Jack lab use dark navy surfaces, high-contrast off-white text, electric cyan for voice/live, controlled green for ready states, orange for roast, gold for winners, and calm red for unavailable data. Glow is localized to active state indicators. There are no odds boards, slot graphics, flashing casino effects, or uncontrolled neon. Desktop uses two-column command surfaces; mobile collapses to one column with full-width actions.

## 9. Moderation and safety

The moderation decision contains the target, requested/effective level, grounded fact IDs, decision, reason, and resolved policy. Original Gemini or fallback copy cannot publish until moderation succeeds and the commissioner approves the final edit. Changing the edit requires revalidation. Winner protection and player opt-out are evaluated before target selection. Unsupported or missing fact IDs fail closed.

## 10. Testing plan and executed coverage

Automated tests cover:

- strictest-level resolution and every adult-content gate;
- winner protection, co-winners, and tiebreakers;
- protected/private topics, unsupported facts, and profanity limits;
- season-memory derivation;
- voice bounds and static/text-only fallbacks;
- SQLite persistence and separation of admin settings from player consent;
- grounded recap, admin approval, consent-aware broadcast, failed delivery fallback, non-cash side bets, perfect-sheet double payout, authentication, scores, schedules, logos, and the guided Jack fixture.

Manual browser QA must cover desktop, 390px mobile, keyboard focus, captions, text-only, reduced motion, every avatar state, live score swing, injury shock, recap/winner, data outage, player opt-out, and admin persistence.

## 11. Roadmap

- **Now:** deploy the implemented policy, memory, control booth, browser voice, avatar states, and server TTS adapter.
- **Next:** create and approve an original designed voice; add encrypted audio caching only if desired; connect authenticated main-assistant playback to the server endpoint.
- **Then:** license injury/roster data, normalize provider IDs, add commissioner history editing with revision diffs, and add provider viseme-driven lip sync.
- **Later:** add per-player language/voice preference persistence, a moderation review inbox for individual draft lines, and season awards derived from verified data.

## 12. Code, setup, and release checklist

Primary code:

- `src/jackHost.js` — policy, moderation, memory, winner, voice, and avatar-state domain rules.
- `src/JackExperience.jsx` — avatar and commissioner control booth.
- `src/JackDemo.jsx` — event-driven avatar, voice controls, fallback, and demo control booth.
- `server/leagueService.js` — strict-policy target selection and winner-protected recap generation.
- `server/store.js` / `server/postgresStore.js` — persistent settings, player policy, memory fields, consent, and audit.
- `server/ttsService.js` — server-only optional designed-voice adapter.

Setup remaining for premium voice: choose a provider, create an original (not cloned) voice, confirm commercial rights and provider terms, add the server-only variables to Vercel, redeploy, and test the authenticated speech endpoint. No extra setup is required for browser voice, captions, text-only, avatar states, or the deterministic acceptance demo.
