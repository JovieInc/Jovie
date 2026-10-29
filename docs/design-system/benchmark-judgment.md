# DS certification: benchmark judgment (peak moments, share menu, Connect Spotify)

Judge: Opus 5.5, 2026-10-25. Input: gem:~/ds-cert-dispatch/benchmark-library.json (v1), origin/main 765937512d motion tokens, defect-guard-registry DG-001..DG-005.
Sources: leader behavior is from prior product knowledge (Stripe Checkout/Elements, Linear, Raycast, Frame.io, Apple HIG Motion/Feedback/Accessibility). `jovie-research` MCP was down (CONNECTION_CLOSED), so no paid lookups were made. Leader claims are behavioral and not pixel-verified. Verify by capture before quoting them in copy.
Machine form: judgment.json in this directory, keyed by moment id. The certificate's `benchmark` criterion reads it.

## Ground rules (apply to every moment)
1. Adopt the behavior, never the look. Motion durations and easings use existing tokens only:
   `--duration-instant 50`, `--duration-fast 100`, `--duration-normal 160`, `--duration-slow 250`, `--duration-slower 350`, `--ds-motion-cinematic-duration 420`;
   `--ease-out cubic-bezier(0.16,1,0.3,1)` for entrances, `--ease-in-out` for state swaps, `--ease-spring` only for the success check scale (overshoot is at most 1 pop per moment).
   Reduced motion already zeroes every duration token. That is correct but not sufficient: a 0 ms swap of a layout change still jumps. The rule is that reduced motion **replaces** translate/scale with a `--duration-fast` opacity cross-fade (Apple HIG). It does not remove all feedback.
2. A peak moment is one beat, at most 1.2 s total, non-blocking, never a modal, and fires once per event id (persisted server-side, not localStorage).
3. Every success is announced once through a single app-level `aria-live="polite"` region (`LiveAnnouncer`). Errors use `role="alert"`. Components never mount their own live regions, because duplicate announcements count as a defect.
4. Focus after a peak goes to the next action (the primary CTA), never to `body` and never stays on an unmounted node.
5. Keyboard-initiated actions skip decorative motion (Raycast rule). Confetti never plays when the event came from a key press.
6. No layout shift. Every swap reserves final geometry (CLS contribution 0 in the story capture).

## Peak moments

### 1. Stripe checkout success (`checkout-success`)
Benchmark: Stripe Checkout keeps the button width fixed while it morphs from label to spinner to check, acknowledges success before it redirects, and keeps card input on error. Linear lands you on the unlocked feature.
| gap | decision | reason |
|---|---|---|
| button geometry jumps on pending | adopt | `button-morph.test.tsx` exists; extend it to the pay button |
| success acknowledged before redirect | adopt | a redirect with no acknowledgement reads as a crash at the moment money moves |
| land on the unlocked feature, not /billing | adopt | route `return_url` to the feature that triggered the upgrade, with a fallback to dashboard |
| Stripe-hosted success page | skip | we return from hosted Checkout; we own only the return state |
| confetti on payment | skip | paying is a transaction, not an achievement. Apple: celebrate rarely |
Motion: label to spinner cross-fade `--duration-fast` `--ease-in-out`. Spinner to check: stroke draw 250 ms `--ease-out` plus scale 0.9 to 1 `--ease-spring`. Hold 600 ms, then navigate. Total is at most 1.0 s. Reduced motion: static check with an opacity fade of 100 ms and the same 600 ms hold.
A11y: announce "Payment complete. Pro is active." After navigation, focus the h1 of the landing feature. On failure, `role="alert"` beside the button, focus the first invalid field, and keep inputs.
Assertions: `pay-button.boundingBox` is equal (±0.5 px) across idle, pending and success. LiveAnnouncer receives exactly 1 message. The return route is not `/billing` when `?from=` is set. Under reduced motion, no `transform` changes during the transition. Error state preserves input values.

### 2. First release created (`first-release-live`)
Benchmark: Frame.io resolves the upload in place into the finished asset. Things lets the completed item settle into its final slot.
| gap | decision | reason |
|---|---|---|
| empty state is replaced by a list re-render (jump) | adopt | EmptyToFilled: the new row occupies the reserved slot of the empty state |
| share action appears in place on the new row | adopt | the next job is sharing; do not make the artist hunt for it |
| per-file upload progress with ETA | adapt | release creation is metadata-first; show determinate progress only for artwork upload |
| celebration | adapt | a small check plus a row highlight; confetti only on the *first ever* release, and only when it was pointer-initiated |
Motion: the row enters at opacity 0 to 1, y 4 px to 0, `--duration-slow` `--ease-out`. The highlight background fades out over `--ds-motion-cinematic-duration`. The empty state exits with opacity `--duration-fast`. Reduced motion: opacity only, at 100 ms, with no highlight sweep.
A11y: announce "Release <title> created." Focus moves to the row's Share button. The drawer closes and returns focus to the new row, not to the old trigger, which unmounted.
Assertions: the CLS of the swap is 0 (story capture). `document.activeElement` is the new row's share control. The `release_first_created` celebration fires at most once per artist (server flag). The prior empty-state node is removed.

### 3. Profile goes live (`profile-claimed`)
Benchmark: Stripe activation shows one completed state with the next action. Apple HIG says confirmation belongs to the user's action.
| gap | decision | reason |
|---|---|---|
| "View live profile" as the primary action | adopt | the payoff is seeing it; everything else is secondary |
| copy link inline | adopt | the second job is sharing; one tap |
| full-screen takeover | skip | it blocks the dashboard. Use an inline banner card in place of the setup checklist |
| Celebration with confetti | adapt | allowed once per artist, pointer-initiated, skippable, auto-dismissing at 1.2 s |
Motion: the card replaces the checklist via EmptyToFilled (`--duration-slow` `--ease-out`). Confetti is 1 burst of at most 900 ms on a canvas with `pointer-events:none`. Reduced motion: no confetti and the card fades in at 100 ms.
A11y: announce "Your profile is live at jov.ie/<handle>." Focus goes to "View live profile". The Escape key and any click dismiss the confetti.
Assertions: the confetti canvas has `pointer-events: none` and is removed at or before 1500 ms. The fire count per artist is at most 1. Under reduced motion the Confetti component does not mount. The primary button href equals the public profile URL.

### 4. First fan captured (`first-fan-subscribed`)
Benchmark: Stripe shows the first payment as a notification with amount and source. Raycast confirms with a HUD and never a modal.
| gap | decision | reason |
|---|---|---|
| name the source ("from your Instagram link") | adopt | specificity is the delight; generic "New fan!" is noise |
| HUD/toast, not modal | adopt | the event arrives asynchronously while the artist is doing something else |
| realtime push while the app is open | adapt | show it on next dashboard load if the event was offline; never replay twice |
| confetti | skip | async events must not hijack the screen |
Motion: the toast enters y 8 px to 0 with opacity, `--duration-normal` `--ease-out`. It dwells 5 s, pauses on hover or focus, and exits in `--duration-fast`. Reduced motion: opacity only.
A11y: polite announcement through LiveAnnouncer ("First fan: <masked email or name>, via <source>"). Focus is not moved, because the event is async. The toast is reachable by keyboard with F6 / the landmark.
Assertions: the toast never takes focus. `first_fan` fires at most once per artist. The source string is non-empty. The dwell timer pauses while `:hover` or `:focus-within` applies.

### 5. Connect Spotify success / already connected (`spotify-connect`)
Benchmark: Linear integrations open on the connected state with the account shown. Stripe Connect shows "Connected as X" with a secondary "Change".
| gap | decision | reason |
|---|---|---|
| dialog shows search to an already-connected artist (DG-001) | adopt | prove, don't ask: read the connection before rendering |
| primary enabled with nothing selected (DG-005) | adopt | the label carries the selection; disabled until a candidate is chosen |
| box in box in box (DG-003) | adopt | one surface: the dialog body; the results are a plain listbox |
| triple-redundant copy (DG-004) | adopt | title plus one sentence, no panel label |
| success then auto-close plus a toast | adapt | check in the button for 600 ms, close, then the release matrix rows fill in place |
Motion: same check as moment 1 (spinner to check, 250 ms). Close the dialog with `--duration-normal`. Imported release rows enter with a stagger of 30 ms, capped at 8 rows and 400 ms total. Reduced motion: no stagger, a single 100 ms fade.
A11y: see the state machine below. Announce "Connected Tim White. 14 releases imported." Focus returns to the release matrix first row, or to the trigger if there are 0 releases.
Assertions: listed under the state machine.

### 6. Destructive action with undo ("Remove Spotify") (`destructive-undo`)
Benchmark: Linear applies the change optimistically, shows a toast with Undo, binds Cmd+Z and rolls back with a reason. Apple HIG reserves alerts for actions that cannot be undone.
| gap | decision | reason |
|---|---|---|
| confirm dialog before remove | skip | the remove is reversible; a confirm plus an undo is double friction. Confirm only when the action is not reversible |
| optimistic remove plus toast "Spotify removed. Undo" | adopt | Linear pattern; server delete deferred until the toast expires (soft delete with `deleted_at`) |
| Cmd/Ctrl+Z undoes last destructive action | adopt | keyboard parity; register in the canonical keyboard registry |
| rollback on failure keeps focus | adopt | failure restores the row and puts focus back on it with `role="alert"` reason |
| irreversible variant (data purge) | adapt | AlertDialog with a typed confirm, destructive tone, and focus on Cancel by default |
Motion: the row collapses with height to 0 and opacity, `--duration-normal` `--ease-in-out`. The undo restores it with the reverse motion. The toast follows moment 4's toast spec with an 8 s dwell (destructive actions get a longer dwell than success messages). Reduced motion: opacity only, and the height snaps after the fade.
A11y: announce "Spotify removed. Press Command Z to undo." Focus moves to the next row, else the previous row, else the section heading. The Undo button is the first focusable element in the toast.
Assertions: before the toast expires, the server receives no hard DELETE (a network-mock assertion). Undo within the dwell restores an identical row (deep-equal). Cmd+Z is registered with no collision (keyboard-registry test). After removal, `activeElement` is not `body`. Undo is impossible after expiry, and the toast is gone at that point.

### 7. Empty to filled transition (`empty-to-filled`)
Benchmark: Linear empty views name one action plus a shortcut. Vercel skeletons match the final geometry.
| gap | decision | reason |
|---|---|---|
| shared EmptyToFilled primitive | adopt | used by moments 2, 3 and 5. Build once (`apps/web/components/molecules/EmptyToFilled.tsx`) |
| reserved min-height equal to the first-row height | adopt | removes the jump at the source |
| null-while-loading between empty and filled | skip (forbidden) | render the skeleton of the final geometry, never null |
| animated illustration in the empty state | skip | decoration that competes with the one action |
Motion: the empty state fades out over `--duration-fast`, and content fades and translates 4 px over `--duration-slow` `--ease-out`, overlapped by 50 ms. Reduced motion: an opacity cross-fade over 100 ms.
A11y: the container keeps `aria-busy` true during the swap, then false. The content announcement is the caller's job (exactly 1 message). If focus was inside the empty state's CTA, it moves to the first new item.
Assertions: the container height delta is 0 at 50%, 100% and settle in the story capture. No frame renders null (the story interaction test samples the DOM every rAF). `aria-busy` toggles exactly once.

## Share-menu decision (20-item flat breadcrumb menu)
Verdict: **restructure**. A 20-item flat list fails Hick's law and keyboard scanning. Breadcrumb drill-down (menu to submenu to submenu) hides the common action two levels deep. Benchmarks: the Apple share sheet puts primary targets first and the rest behind "More". Raycast and Linear use type-to-filter in any list with more than about 8 items, and Linear's Cmd+K groups results with headings.
- **Top level shows at most 7 items** in 3 groups with headings (`role="group"` plus `aria-labelledby`):
  1. *Link*: Copy link (default focus, `Cmd+C` while open), Copy smart link, Show QR code.
  2. *Share to*: the 3 platforms this artist used most recently (fallback Instagram, TikTok, X), plus "More platforms...".
  3. *Embed and files*: Copy embed code, Download artwork.
- **Search field at the top** that appears when total items exceed 8 (always true here). Typing filters across all groups, including the hidden platforms, flat-ranked: prefix match, then substring, then recently used.
- **At most 1 level of nesting.** "More platforms..." opens an inline expanded section in the same popover, not a breadcrumb submenu. Back is Left Arrow or Backspace on an empty search.
- Removed: duplicate "Share" entries that only differ by UTM; those move to an Advanced item behind More.
- Motion: popover enters at opacity 0 and scale 0.98 to 1, `--duration-fast` `--ease-out`, transform-origin set to the trigger. The expand section changes height over `--duration-normal`. Reduced motion: opacity only. Keyboard-opened: no scale.
- A11y: `role="menu"` with `menuitem` while search is empty; once the user types, the combobox pattern (`aria-activedescendant`). Copy success announces "Link copied" politely, and the item label swaps to "Copied" for 1.5 s with no width change.
- Assertions: top-level visible `menuitem` count is at most 7. Nesting depth is at most 1. The search input renders when the item total exceeds 8. The query "tik" puts TikTok first. Copy shows the item with a stable bounding box. The popover stays inside the viewport at 390 px (collision test, popover-menu job).

## Connect Spotify dialog state machine
States (exactly one at a time; render reads the connection first):
```
resolving --(conn exists)--> connected
resolving --(no conn)------> searching(idle, prefilled with profile display name)
resolving --(fetch fail)---> error(load)
searching --type (debounce 200ms)--> loading --ok,n>0--> results
                                       loading --ok,n=0--> empty
                                       loading --fail----> error(search)
any --navigator offline--> offline (inputs kept, query kept)
offline --online--> previous state, re-run last query
results --select row--> selected(candidate)        [primary enabled]
selected --primary--> connecting --ok--> success --600ms--> closed
connecting --fail--> selected + inline error (selection kept)
connected --"Change artist"--> searching (query = current artist name)
```
- **connected**: shows avatar, name, follower count, and "Connected" with a check. Primary is **Done**. Secondary is a text button "Change artist". Destructive "Disconnect" sits in an overflow and follows moment 6, with no confirm.
- **searching / results**: one input with no wrapper panel. The listbox shows rows of avatar, name, followers and a "Verified artist" badge. Arrow keys move the active descendant, Enter selects, and Enter on a selected row triggers primary.
- **loading**: skeleton rows at final row height (3 rows). The input stays editable. A spinner appears only if loading passes 300 ms.
- **empty**: "No artists match 'xyz'." plus the one escape hatch "Paste a Spotify artist link". It appears only in empty and error states (DG-004).
- **error**: inline `role="alert"`, "Couldn't reach Spotify. Try again." with a Retry that re-runs the query. Input is kept.
- **offline**: InlineOffline atom, primary disabled, label "You're offline". The query is preserved and the search re-runs on reconnect.
- **Primary button, one label rule**: `Connect {artistName}` once a row is selected, `Connect` (disabled) before then, `Done` in connected. There is never a second primary. Width is reserved for the longest name and truncated with ellipsis, and `aria-label` carries the full name.
- **Search ranking** (server, `/api/spotify/search`; a re-rank of Spotify's top 50 because Spotify's own order is popularity-biased):
  1. Normalize: NFKD, lowercase, strip diacritics and punctuation, collapse whitespace.
  2. Tier by name-token match against query tokens, in order: (T0) exact full name; (T1) every query token is a prefix of a distinct name token, in order ("tim whi" matches "Tim White"); (T2) the same but out of order; (T3) all tokens substring; (T4) partial token match (Tim McGraw, Watt White); (T5) the rest.
  3. Boost within a tier: the artist matching the claimed profile's display name or an existing Jovie link, then followers (log-scaled), then Spotify popularity.
  4. Recall: when the last token is shorter than 4 characters, also fetch `q=<all tokens but last>` (here `tim`), union the results with the full query, and dedupe by id. This way a partial trailing token cannot drop the right artist from the candidate pool. Guessing completions is out of scope.
- A11y: dialog `aria-labelledby` the title, initial focus on the search input (or Done in connected), `aria-activedescendant` on the listbox, results count announced politely ("8 artists"), and focus returns to the trigger on close.
- Assertions (all hermetic, fixture-based):
  - `providerDialogReadsConnectionBeforeSearch`: with a mocked connection, the search input is absent and the primary reads "Done" (DG-001).
  - Ranking fixture: query `tim whi` against a pool of [Watt White, Tim McGraw, Waves Of Time, Tim White] returns Tim White at index 0, and Tim McGraw ranks above Waves Of Time (DG-002).
  - Primary is `disabled` and reads "Connect" until a selection exists, then reads `Connect Tim White` (DG-005).
  - Bordered-surface depth is at most 1 inside the dialog (`surface:nested-bordered`, DG-003).
  - Typing during loading never resets the input (input-retention under rerender).
  - Offline then online re-runs the last query and preserves it.
  - Connecting fails, then the selection persists and `role="alert"` is present.
  - A real Spotify response with no artists renders "empty", not "error".

## Gaps to the library and primitives (actions)
- Add library entries `destructive-undo`, `share-menu`, `spotify-connect`, and `empty-to-filled` (`peak: true`); the v1 draft lacks the first three.
- New primitive: `LiveAnnouncer` (single app-level polite region plus an alert channel). Every peak moment depends on it, and its absence is the most likely silent a11y failure.
- New token: `--duration-peak-hold: 600ms` for the success hold, so the hold is not hard-coded in 4 places.
- Celebration contract amendment: no mount under reduced motion, and no mount for keyboard-initiated events.
- Undo contract: a server soft delete with a deadline equal to the toast dwell. This is a backend guard, not just UI.
