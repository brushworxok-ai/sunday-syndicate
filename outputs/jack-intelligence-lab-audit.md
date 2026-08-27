# Jack Intelligence Lab — implementation and acceptance audit

Date: 2026-08-18  
Direct demo: `/?view=join&invite=405JACK&stage=league`

## Outcome

The app now includes a deterministic four-player Jack test league that proves the requested experience without presenting test fixtures as current NFL information. Every score, injury, roster fact, and historical record in the lab is labeled as simulated fixture data. Projected standings are never presented as final, and commissioner verification remains required before any winner or payout is finalized.

The visual direction uses a dark premium social-sports system with restrained live-green accents, strong hierarchy, real team marks with monogram fallbacks, and responsive layouts. It intentionally avoids sportsbook balances, casino reels, odds cards, and other real-money gambling cues.

## Acceptance fixture

| Player | Favorite team | Jack setting | 2025 record | Pick Sense |
|---|---|---|---:|---:|
| Chris Morgan | Buffalo Bills | No Roast Mode | 142–130, 52.2%, #4 | 58 |
| Marcus Reed | Dallas Cowboys | Light Roast Mode | 162–110, 59.6%, #2 | 72 |
| Avery Johnson | Kansas City Chiefs | Competitive Mode | 168–104, 61.8%, #1, one title | 79 |
| Taylor Brooks | Philadelphia Eagles | Full Smart-Ass Mode | 135–137, 49.6%, #3 | 49 |

Pick Sense is explicitly identified as a fictional league metric based only on pick results. It is never framed as a measure of intelligence or personal worth.

The live fixture starts Buffalo 20, Kansas City 17 with 6:08 left in the fourth quarter. The update changes the score to Kansas City 24, Buffalo 20 with 2:14 left. Avery’s projected standing moves from #2 to #1 and Marcus moves from #1 to #2. The board remains labeled `NOT FINAL`.

The injury fixture changes Kansas City QB1 from Questionable / Limited at 8:31 PM CT to Out / Will not return at 8:38 PM CT. The generic player label avoids implying a claim about a real athlete.

## Consent and personality policy

- No Roast Mode: fact-only output; the UI explicitly says no joke was generated.
- Light Roast Mode: one gentle, encouraging line with no humiliation.
- Competitive Mode: sharper league banter tied to the visible pick and standings.
- Full Smart-Ass Mode: the strongest sports-only line, still excluding protected or private topics.
- Never joke about appearance, family, health, money, identity, grief, disability, or private life.
- Never infer a player’s tone from chat behavior. Use the stored explicit setting.
- Commissioner review is required before an AI recap is broadcast.
- Opt-out is immediate and takes precedence over league defaults.

The lab renders all four modes side by side against the same facts so reviewers can confirm that tone changes while factual content remains stable.

## Memory architecture

The demo uses immutable fixture objects so acceptance testing is repeatable. The production target should persist the same concepts separately:

- `player_preferences`: player ID, favorite team ID, roast level, voice-playback preference, consent version, effective timestamp.
- `season_records`: league ID, player ID, season, correct picks, total picks, rank, titles, verified timestamp.
- `sports_snapshots`: provider, entity type, provider IDs, normalized payload, source timestamp, fetched timestamp, freshness state.
- `jack_interactions`: player ID, normalized text transcript, grounded fact IDs, response, moderation decision, admin approval state. Do not store raw microphone audio by default.

Gemini should receive only the minimum required facts: authenticated player identity, their own preferences and history, public league standings, and normalized provider facts. Hidden picks, account balances, secrets, raw provider payloads, and other players’ private fields stay out of prompts.

## Sports-data provider plan

The existing server adapter already supports SportsDataIO live/final game scores using a server-only `SPORTSDATAIO_API_KEY`. SportsDataIO’s NFL documentation supports API-key authentication through the `Ocp-Apim-Subscription-Key` header and includes live/final game state, team/player profiles, depth charts, and injuries. Its official workflow guide recommends refreshing injuries around published practice reports and again near the 90-minute inactive-list window.

Recommended normalized server endpoints:

- `GET /api/sports/nfl/games?season=&week=` — schedule, clock, score, game state, provider freshness.
- `GET /api/sports/nfl/injuries?season=&week=` — designation, body part, participation, notes, updated time.
- `GET /api/sports/nfl/teams/:teamId/roster` — normalized players, positions, active/roster status.
- `GET /api/sports/nfl/teams/:teamId` — canonical team identity and logo metadata.

Suggested cache policy:

- Live score/game state: 30–60 seconds while games are active; longer outside game windows.
- Injury feed: 5–15 minutes on game day and after practice-report windows; 60 minutes otherwise.
- Rosters and team profiles: 6–24 hours, with explicit invalidation after transactions.
- Historical league records: immutable after commissioner verification unless an audited correction is entered.

SportsDataIO’s free trial uses scrambled data and is suitable for schema/integration testing only. Its Discovery Lab offers real but next-day-delayed data and is not suitable for this live experience. A true live commercial key is sales-priced according to coverage, volume, and use case, so no unverified fixed production price is claimed here.

The app must keep the current fallback contract: retain the last successful timestamped snapshot, label it stale, avoid generating new factual claims, and block automatic winner finalization until verification succeeds.

## Voice feasibility and privacy

The lab implements browser-native `SpeechRecognition` (including the common prefixed implementation) and browser `speechSynthesis`. The transcript is displayed in an editable field before it is submitted to Jack. If recognition is unsupported or errors, the same typed/editable path remains available. The test button loads a deterministic transcript so QA does not depend on microphone hardware or browser permissions.

Browser speech recognition is not uniformly supported and may use a platform service. Production UI should continue to disclose that fact, request microphone permission only after a user gesture, and keep raw audio out of application storage. Text transcripts should have a documented retention period and a delete control. Speech synthesis is optional and user-triggered.

## Verification performed

- Production build succeeded.
- 46 automated tests passed, including ten Jack test-league tests.
- Desktop browser test: score swing, #1 rank change, major injury change, four consent levels, history-aware recap, voice transcript/answer, and safe outage fallback all passed.
- Mobile browser test at 390×844: the same interactions passed; cards collapse cleanly, controls remain reachable, and the voice form stays editable.
- Browser console: zero errors and zero warnings on desktop and mobile.
- Accessibility evidence: semantic headings, labeled transcript field, status regions, disabled completed actions, descriptive team/Jack images, and reduced ambiguity between live, updated, stale, and non-final states.

## Production readiness boundary

Complete now: deterministic acceptance experience, consent enforcement, four tone levels, remembered prior-season fixture records, live/injury state changes, editable voice input, optional spoken response, recap, safe fallback, responsive visual system, and automated/browser proof.

Still required for actual current NFL intelligence: purchase and configure an approved live data plan; extend the server adapter for injuries/rosters; add durable player preference/history tables; add provider monitoring and rate-limit alerts; run a privacy review for transcript retention; and validate real provider output during a live game before enabling automatic current-data responses.

