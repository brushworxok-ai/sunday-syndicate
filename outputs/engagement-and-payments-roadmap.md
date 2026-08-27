# Sunday Syndicate: engagement and payments roadmap

Updated August 14, 2026.

## Delivered in this build

- A signed-in **Syndicate Assistant** powered by Gemini. It answers questions about verified standings, schedules, rules, app features, and only the signed-in player's entry-credit balance.
- Server-built AI context with bounded chat history. Hidden picks, PINs, phone numbers, payment handles, and other players' account balances are excluded.
- A verified local fallback so basic league questions still work when Gemini is unavailable.
- An automatic **weekly champion ceremony** after every game is final, with confetti, crown, final score, purse, and a victory-lap shortcut to chat.
- **Preview winner ceremony** controls on both the home page and historical demo proof board, plus animated victory rays and a more prominent champion stage.
- Keyboard dismissal and `prefers-reduced-motion` support for the celebration.
- A more dimensional game-day look: subtle background glow, card lift, a floating AI assistant, and a four-tool Gemini room.
- Verified logos for all 32 clubs, team-color fallbacks, and logo-led pick cards, featured matchups, and live-score tiles.
- A one-tap **friendly wager menu** with Score Duel, Crown for a Day, Tiebreaker Duel, and a randomized “Surprise me” option. These remain non-cash challenges with explicit acceptance and auditable settlement.
- A final-only **Share results** experience that opens the device’s native group-chat share menu, falls back to clipboard copy, and includes the winner, 2× perfect-sheet bonus, standings, results link, and league-chat link.
- Every approved SMS recap now includes a deep link to the exact season/week results screen; consent suppression, delivery receipts, retry limits, and in-app fallback continue to apply per recipient.
- A compliance-gated funding roadmap inside the player account page.
- A delivered commissioner-payment workflow: players mark the current week’s $20 as sent, balances remain unchanged while pending, and only an authenticated commissioner can confirm or reject the claim.
- A protected finance desk showing every player’s weekly payment/sheet status, confirmed balance, win count, perfect-sheet count, lifetime winnings, and unpaid winnings.
- Verified weekly settlement with idempotency, non-bust tiebreaker resolution, rollover handling, external payout confirmation, and a 2× payout when the winning sheet is perfect.

## Payment options besides Stripe

The correct provider depends on whether this league is legally treated as gambling, a contest, or a permitted social pool in every relevant jurisdiction. Provider approval must cover the exact entry-fee and prize model.

| Option | Player experience | Recommendation |
| --- | --- | --- |
| **Trustly Pay by Bank** | Player chooses a bank, authenticates with the bank, and funds directly | Strong candidate after gaming-merchant and legal approval. [Trustly markets a U.S. gaming-specific Pay by Bank product](https://www.trustly.com/us/gaming). |
| **Nuvei gaming cashier** | Cards, bank transfers, wallets, deposits, and payouts through one cashier | Strong candidate for a more regulated or larger operation. [Nuvei's gaming platform supports multiple deposit and payout methods](https://www.nuvei.com/use-cases/online-gaming). |
| **Worldpay Gaming** | Familiar cards and alternative methods through a gaming-focused merchant account | Worth merchant review. [Worldpay offers a dedicated gaming payments program](https://www.worldpay.com/en/industries/gaming). |
| **Commissioner-confirmed offline payment** | Cash, check, or another explicitly approved offline payment; the commissioner verifies it and posts an auditable credit | Practical controlled fallback. The app should never automatically claim payment before commissioner confirmation. |
| **Sponsor-funded/free-to-play league** | Participants pay nothing; a sponsor supplies prizes | Lowest payment friction and often the simplest product model, though contest and promotion rules still need review. |

### Methods not to turn on casually

- PayPal treats gambling, games, and activities with an entry fee and prize as approval-sensitive activity. [PayPal Acceptable Use Policy](https://www.paypal.com/us/legalhub/paypal/acceptableuse-full?locale.x=en-US_US)
- Venmo similarly requires prior approval for gambling, gaming, or entry-fee/prize activity. [Venmo legal guidance](https://venmo.com/legal/us-helpful-information)
- Cash App prohibits gambling activity except legal activity involving merchants approved by Cash App and its banking partners. [Cash App Acceptable Use Policy](https://cash.app/us/en/legal/acceptable-use-policy)
- Square's payment terms list betting, sports-related gambling, and wagers among prohibited payment-service uses. [Square Payment Terms](https://squareup.com/us/en/legal/general/payment)

Do not label pool entries as gifts, dues, food, or another category to avoid processor review. That creates account-closure, frozen-funds, chargeback, and legal risk.

## Can participants chat with the app?

Yes. Gemini supports multi-turn conversation history, including in the JavaScript SDK. [Google's Gemini multi-turn chat documentation](https://ai.google.dev/gemini-api/docs/generate-content/text-generation)

The implemented assistant can answer questions such as:

- “Who is leading?”
- “Are the standings final?”
- “Is this week's sheet locked?”
- “How many entry credits do I have?”
- “Explain the tiebreaker.”
- “Where do I change my trash-talk consent?”

It deliberately does not provide betting odds, team recommendations, injury claims, hidden picks, legal conclusions, or another participant's private information.

## Best next fun features

1. **Weekly awards show** — Gemini generates factual awards such as Best Comeback, Lone-Wolf Pick, Tiebreaker Heartbreak, and Coldest Streak, with the existing consent rules applied.
2. **Rivalry cards** — opt-in season head-to-head records between friends, private challenge invitations, and rivalry-specific trophy badges.
3. **Pick reveal timeline** — picks remain private before lock, then reveal game-by-game after kickoff so the scoreboard shows who gained or lost ground.
4. **Receipt Book** — save bold chat predictions before kickoff and surface the funniest accurate or inaccurate receipts after results are final.
5. **Game-day reactions** — emoji reactions attached to live games rather than one undifferentiated chat feed.
6. **Season trophy room** — weekly crowns, longest winning streak, season points, side-bet tokens, and past champion cards.
7. **Shareable champion card** — export a polished image containing the winner, score, week, and league branding for group chats or social media.
8. **Responsible-play controls** — weekly funding caps, cool-off periods, age confirmation, transparent transaction history, and clear rules before any real payment flow.
9. **Group rivalry cups** — split willing players into two teams for a week and award a shared, non-cash trophy based on total correct picks.
10. **Loser-lounge cosmetics** — opt-in temporary profile frames or commissioner-approved dares, never automatic public humiliation and always covered by trash-talk consent.

## Correct Vercel login command

The screenshot shows the login command pasted three times without a line break, producing `loginnpm.cmd` as one invalid argument. Open PowerShell in the project folder and run this command exactly once:

```powershell
npm.cmd exec --cache .npm-cache --yes --package=vercel@latest -- vercel login
```

Wait until the terminal confirms the login before running deployment.
