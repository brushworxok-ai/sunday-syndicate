# Production verification — September 4, 2026

Status: code fixes verified locally; live delivery acceptance remains pending. This is not a certification that every line or every production path is bug-free.

## Fixed

- Client-supplied payment flags no longer mark an entry paid. Payment claims and confirmed payments are separate; resubmission preserves sheet identity, paid status and claims.
- League responses hide unlocked rival picks/tiebreakers, private balances and claims, contact details, draft recaps, private challenges and operational logs. Push subscription credentials are excluded even for commissioners.
- Authenticated actions reject a player from another league. Malformed cookies no longer crash authentication. Deployed apps reject seeded demo PINs, and actual SQLite credentials now invalidate old sessions on PIN reset.
- Failed sign-ins are rate-limited. A forged cron header cannot authenticate a production cron request. Commissioner sign-out is now visible.
- Closing Jack or switching accounts aborts microphone capture and pending assistant requests. Microphone failures cannot send partial questions. Transcripts retain word spacing, and overlapping requests are prevented.
- Commissioner diagnostics show the selected studio voice, provider configuration and a single-test workflow. A durable request claim prevents retrying an uncertain SMS send twice. Accepted/queued is explicitly distinguished from delivered.
- Payment confirmations and final results retain in-app notifications; manual completion of a week now triggers the results notification too.
- ESPN's current injury response parses correctly. Live read-only validation returned 31 team groups. News headlines are no longer labeled exclusively as injuries.
- Tied college rankings use team identity rather than rank as a React key.
- Updated `qs` from 6.15.3 to 6.16.0. See the [upstream advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g). Dependency audit reports zero known vulnerabilities.

## Evidence

- Production build and 92 automated tests passed, including provider mocks, signed Telnyx webhooks, duplicate-send prevention, voice cancellation, multi-device push, payment/credit workflows and HTTP permission checks.
- Synthetic HTTP workflow exercised player and commissioner sign-in, chat, payment history, notifications, payment claims, confirmation, resubmission, hidden public picks and rejected cross-league requests. No real payments or player messages were used.
- Local browser rendered Home, Picks, Board, Chat, Game Day Live, Player Stats, Season, Survivor, Prop Picks, College FB, My Payments, Notifications, entries, profile, Side Bets, AI Tools, House Rules, Demo Proof and Commissioner without a crash or horizontal page overflow at the normal viewport. Some checks used deep links. This does not certify every button on every page.
- Local commissioner sign-in/sign-out and read-only communication diagnostics worked. A synthetic player signed in and received Jack's text answer to a scoring question.

## Live acceptance still required

1. Sign in as commissioner on the production site. Check the actual ElevenLabs voice name; listen on the intended device and confirm it is the desired Jack voice.
2. Send the ONE approved test to the configured commissioner phone from the new diagnostics panel. Check the carrier delivery trace and confirm receipt on the handset. No other players are authorized recipients for this test.
3. Sign in as a player on the intended device, enable push, and use the existing test button. Confirm the OS notification appears, then verify the app opens correctly.
4. Test microphone permission, playback and layout on physical iPhone/Android devices. Automated viewport override failed in the connected browser; mobile-size validation is not complete.
5. Daily cron plus opportunistic visits cannot guarantee 24-hour/3-hour reminders. Provision a suitably frequent authenticated scheduler before promising exact timing. No paid plan or external scheduler was changed.

Remaining infrastructure limits: sign-in throttles are per process, and provider unit tests do not prove real carrier/OS delivery. No load/soak test or database restore drill was performed in this pass. Preserve regular backups and validate operational recovery before a production-readiness sign-off.
