# Jack demo product audit and verification

Date: August 18, 2026

## What changed

The first impression was rebuilt around Jack as a restrained league host. The previous slot-machine and neon-casino treatment was removed from the home experience. The visual system now uses navy, white, soft blue, muted gold, and warm neutral surfaces. Jack appears where a host is useful: invitation, onboarding, game-day context, recap generation, and the assistant.

## Guided demo

Deep link: `/?view=join&invite=405JACK`

The demo is explicitly labeled as simulated and does not create a real account, read a real NFL score provider, process a payment, or finalize a winner. Its deterministic states cover:

1. Invite-link recognition and invalid/expired invite handling.
2. Account creation with email, password length, duplicate demo account, league-rules consent, and humor-preference validation.
3. A personalized onboarding message from Jack.
4. A Buffalo at Kansas City simulated live game with quarter, clock, scores, update time, team logos, and a prominent “not a real NFL feed” disclosure.
5. A Kansas City touchdown changing the projected leader from Marcus Reed to Avery Johnson.
6. Chris Morgan set to “No jokes,” which blocks him from roast targets.
7. Avery Johnson and Jordan Lee set to competitive roast mode, allowing league-performance jokes.
8. A grounded Jack recap that calls the standings a live projection and requires admin review before sharing.
9. A live-data outage state that preserves the last successful timestamp and refuses to finalize a winner or payout before commissioner verification.

## Truth model

- `SIMULATED LIVE DEMO` means deterministic product-test data.
- `LIVE DATA UNAVAILABLE` means the last successful snapshot may be shown, but no winner or payout can be finalized.
- Projected standings are always marked as projections while a game is live.
- Production live scores remain server-sourced through the existing SportsDataIO adapter when configured; otherwise the real league uses its visible manual/commissioner-verification fallback.
- Jack/Gemini output is grounded in stored league facts, moderated against player and league preferences, and held for commissioner approval before broadcast.

## Automated verification

`npm.cmd run check` builds the production bundle and runs 46 tests. Ten tests cover the guided Jack demo and intelligence lab: invite validation, account creation and consent, favorite-team onboarding, four distinct player/tone combinations, score-driven rank movement, exact humor-level boundaries, prior-season memory, grounded recap wording, voice-answer grounding, and live-data fallback safety.

## Interactive verification

The full path was exercised in the in-app browser at a normal desktop viewport and at 390 × 844 mobile size. Verified controls and states:

- Invite verified → Join now.
- Rules checkbox blocks account creation when unchecked.
- Successful demo account creation and Jack welcome screen.
- Initial 20–17 Buffalo lead and projected standings.
- Score update to Kansas City 24–20 and Avery moving to first.
- Chris visibly protected; Avery and Jordan visibly allowed.
- Jack recap generated with consent labels and non-final language.
- Live-data unavailable fallback and retry action.
- Responsive layouts, readable score cards, horizontal navigation, and clear mobile actions.
- No browser console warnings or errors during the run.

The mobile pass found and fixed one collision: the floating Jack assistant overlapped the invite action. The assistant is now hidden inside the guided demo and positioned on the opposite side elsewhere.

## Production follow-ups

The guided demo is complete. Production-grade public account signup still requires a managed identity/email-verification service instead of the current commissioner-issued private PIN flow. True automatic live scoring requires a valid server-only provider key, rate-limit monitoring, and continued commissioner verification/fallback. Those items must remain visibly distinct from deterministic demo data.
