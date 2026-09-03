# 405 Badguys Parlay — Design System

This file documents the shipped interface. Page-specific documents may add rules but must not override accessibility, privacy, or interaction requirements here.

## Product character

Dark sports control room: direct, competitive, fast to scan, and playful without hiding important league state. The interface is mobile-first, uses a restrained neon green/blue/gold accent system, and keeps payment, deadline, and verification states explicit.

## Tokens

| Role | Value | Runtime token |
|---|---:|---|
| Background | `#0A0A12` | `--bg` |
| Surface | `#13131E` | `--surface` |
| Card | `#181825` | `--card` |
| Primary text | `#E8E8F0` | `--ink` |
| Secondary text | `#9AA3B2` | `--muted` |
| Primary action | `#39FF14` | `--neon` |
| Information | `#00D4FF` | `--blue` |
| Winner/payment | `#FFD700` | `--gold` |
| Error | `#FF4D4D` | `--rust` |
| Subtle border | `rgba(255,255,255,.08)` | `--line` |

All body-sized text must meet WCAG AA contrast. Never use opacity alone to communicate state.

## Typography

- Body and interface: Manrope, then system sans-serif.
- Data labels and compact metadata: DM Mono.
- Editorial emphasis only: Newsreader italic.
- Headlines use tight letter spacing; body copy uses a comfortable 1.5–1.7 line height.
- Do not introduce an additional display family.

## Spacing and shape

- Base spacing unit: 4px. Common gaps: 8, 12, 16, 20, 24, and 32px.
- Controls: at least 44×44px touch target; primary buttons use a 10px radius.
- Cards: 12–18px radius with a subtle border, not a heavy shadow.
- Sheets and dialogs: 20–22px radius with a dimmed, blurred overlay.
- Keep information density moderate. Prefer grouped sections and short labels over extra explanatory cards.

## Navigation

- Persistent bottom navigation contains Home, Picks, Results, Chat, and More.
- Navigation uses the shared outline SVG icon set; never use emoji as a structural icon.
- The active destination has `aria-current="page"`, a visible label, and neon state.
- More is a grouped modal sheet: Play, League, Account, and Tools.
- Navigation updates browser history and restores main-content focus.

## Components

### Buttons

- Primary: neon background, dark text, minimum 44px height.
- Secondary: dark or transparent background with a visible border.
- Destructive actions use red only when the action is genuinely destructive.
- Hover may lift up to 2px on pointer devices. Touch devices do not retain hover transforms.
- Every icon-only button requires an accessible name.

### Forms

- Inputs use 15–16px text, an explicit visible label, a dark surface, and a visible border.
- Focus uses the neon 2px outline with 3px offset.
- Placeholder text is supportive, not a replacement for a label.
- PIN and OTP fields declare appropriate autocomplete and numeric input modes.
- Validation errors use clear language and an alert/status announcement.

### Tables and results

- Tables require a caption and scoped column/row headers.
- Critical values use tabular numbers.
- On small screens, tables scroll inside their own region and never widen the page.
- Hidden picks remain absent from the API response until the viewer is authorized or the week is locked.

### Dialogs and sheets

- Use `role="dialog"`, `aria-modal="true"`, and a labelled heading.
- Move focus inside, trap Tab/Shift+Tab, close on Escape, and restore prior focus.
- Lock background scrolling and make the rest of the app inert while open.

## Motion and media

- Default transitions are 150–250ms and limited to state feedback.
- Honor `prefers-reduced-motion` in CSS and JavaScript.
- Jack’s avatar becomes a static image when reduced motion is requested.
- Recap autoplay always exposes Pause/Resume and stops auto-advancing on the last slide.
- Avoid perpetual pulse, shimmer, bounce, or breathing effects when reduced motion is active.

## Content and privacy

- Use plain language: “Sign in,” “Make picks,” “Payment confirmed,” and “Picks lock.”
- Do not expose phone numbers, private picks, payment claims, chat, payouts, audit history, or provider configuration to signed-out users.
- Member-only payment handles exist solely to settle league obligations.
- Winner and error states combine icon, label, and color.
- Emoji may appear as user-selected avatars or decorative sports flavor, never as the sole structural control.

## Responsive contract

- 320–480px: one-column layout, bottom navigation, safe-area padding, internal table rails.
- 768px: two-column cards where content supports it.
- 1024px+: full operations grids while preserving readable line lengths.
- Test at 375, 768, 1024, and 1440px with no horizontal page scroll or fixed-navigation overlap.

## Release checklist

- [ ] Production build succeeds and all automated tests pass.
- [ ] Keyboard navigation, visible focus, modal focus return, and skip link work.
- [ ] Text and controls meet contrast and 44px touch-target requirements.
- [ ] Reduced-motion mode removes non-essential animation and autoplay video.
- [ ] Main navigation and action controls use the shared SVG icon set.
- [ ] Signed-out league response contains no member, payment, or admin data.
- [ ] 375, 768, 1024, and 1440px layouts have no horizontal page scroll.
- [ ] Offline navigation, push click routing, and manifest shortcuts use the single `/sw.js` worker.
