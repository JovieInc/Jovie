# Motion

Animation doctrine for Jovie UI. Sibling of `ui.md` — read that first for the component hierarchy and the No Decorative Hover Motion rule. Always reference `design-system.css` tokens; never hardcode durations, easings, or scale values (enforced by `@jovie/no-raw-motion-values`).

> **Attribution:** Adapted from Emil Kowalski's `emil-design-eng` skill
> (https://github.com/emilkowalski/skills), MIT License — copyright notice per
> the repository LICENSE file. Reconciled to Jovie System B tokens; where the
> source and Jovie doctrine disagree (e.g. press scale), Jovie wins.
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files, to deal in the Software
> without restriction, subject to inclusion of the above copyright notice.
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## 1. Should this animate at all?

Ask how often the user sees it:

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette toggle) | No animation. Ever. |
| Tens of times/day (hover, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, celebrations) | Can add delight |

**Never animate keyboard-initiated actions.** Animation makes repeated actions feel slow and disconnected.

Every animation needs a purpose: spatial consistency, state indication, feedback, explanation, or preventing a jarring change. "It looks cool" is not a purpose for anything seen often. This composes with ui.md's **No Decorative Hover Motion** rule — no lift-on-hover polish moves.

## 2. Duration — System B token map

UI animations stay under 300ms. The two-tier intent vocabulary (`DESIGN.md → Motion`) is the default: SUBTLE for micro-interactions, CINEMATIC for high-impact reveals. The full ladder:

| Element | Token | Value |
| --- | --- | --- |
| Opacity flick, skeleton swap | `--duration-instant` | 50ms |
| Button press feedback | `--duration-fast` … `--duration-normal` | 100–160ms |
| Tooltips, small popovers | `--duration-fast` … `--duration-subtle` | 100–150ms |
| Hover, focus, color, icon swap, toast | `--duration-subtle` | 150ms |
| Dropdowns, selects | `--duration-subtle` … `--duration-slow` | 150–250ms |
| List/height collapse | `--duration-slow` | 250ms |
| Modals, drawers, surface morphs | `--duration-cinematic` | 420ms |
| Marketing/explanatory | may exceed the ladder — still token-based | — |

All duration tokens zero out under `prefers-reduced-motion: reduce` (handled centrally in `design-system.css`) — using tokens is what makes your animation accessible for free. Do not add per-component reduced-motion overrides for duration; do remove transform-based *movement* (translate) under reduced motion while keeping opacity/color transitions that aid comprehension.

Perceived performance: a 150ms dropdown feels more responsive than a 400ms one; `ease-out` at the same duration feels faster than `ease-in` because the user sees immediate movement.

## 3. Easing decision tree — System B token map

```
Entering or exiting the screen?
  → var(--ease-out)                  /* starts fast; feels responsive */
Moving/morphing while on screen?
  → var(--ease-in-out)               /* natural accel/decel */
Drawer / sheet open-close?
  → var(--ease-drawer)               /* iOS-like settle */
Hover / color / focus micro-change?
  → var(--ease-subtle)               /* System B subtle easing */
High-impact reveal (modal, composer morph)?
  → var(--ease-cinematic)
Constant motion (marquee, progress, spinner)?
  → linear                           /* the CSS keyword */
Playful overshoot (rare, opt-in)?
  → var(--ease-spring)
Default when unsure → var(--ease-out)
```

Rules:

- **Never use `ease-in` for UI.** It delays the initial movement — the exact moment the user is watching. It has no token on purpose.
- **Never use raw `cubic-bezier(...)` in component code.** System B curves are already the "strong custom curves" the craft calls for; the built-in CSS keywords (`ease`, `ease-out`) are too weak.
- **Trap:** `--ease-linear` is a legacy alias of `--ease-interactive` and is *not* linear. For constant motion use the CSS keyword `linear`; never reach for `--ease-linear`.
- Prefer the pre-composed patterns (`--transition-colors`, `--transition-transform`, `--transition-collapse`, …) before composing your own.

## 4. Component rules

### Press feedback

Every pressable element scales down on `:active`. Jovie's canonical press scale is **`var(--scale-press)` (0.96)** — per ui.md, not the source's 0.97.

```css
.button {
  transition: transform var(--duration-normal) var(--ease-out);
}
.button:active {
  transform: scale(var(--scale-press));
}
```

Press feedback must be tactile and interruptible; provide a static opt-out when motion would distract (ui.md).

### Never animate from `scale(0)`

Nothing real appears from nothing. Enter from `scale(0.95)` or higher, combined with `opacity: 0`.

### Origin-aware popovers

Popovers scale from their trigger, not center: `transform-origin: var(--radix-popover-content-transform-origin)` (Radix) or `var(--transform-origin)` (Base UI). **Exception: modals stay centered** — they are not anchored to a trigger.

### Tooltips

Delay the first tooltip; once one is open, adjacent tooltips open instantly (skip delay + skip animation). Animate at `--duration-fast` with `--ease-out`.

### Transitions over keyframes for dynamic UI

CSS transitions can be interrupted and retargeted mid-animation; keyframes restart from zero. Anything rapidly triggered (toasts, toggles) uses transitions. Use `@starting-style` for enter animations where support allows; fall back to the `data-mounted` attribute pattern.

### Asymmetric timing

Slow where the user is deciding, fast where the system is responding. Hold-to-confirm presses can be long and `linear`; release/response snaps back at `--duration-subtle` with `--ease-out`. Exits are generally faster than enters.

### Stagger

When a list enters together, stagger 30–80ms per item, `--ease-out`, translateY ≤ 8px. Stagger is decorative — never block interaction while it plays.

### Blur to mask imperfect crossfades

If a two-state crossfade shows both states overlapping, a transient `filter: blur(2px)` bridges them. Keep blur small — heavy blur is expensive, especially in Safari.

## 5. Performance

- **Only animate `transform` and `opacity`.** Animating `width`/`height`/`padding`/`margin` triggers layout + paint. (`--transition-collapse` is the sanctioned exception for expand/collapse.)
- Prefer `translateY(100%)` percentages over pixel values — they adapt to content size.
- Don't animate CSS variables on a parent during drag — it recalculates all children. Set `transform` directly on the element.
- Motion (Framer Motion) shorthand props (`x`, `y`, `scale`) run on the main thread. Under load, use the full `transform` string, plain CSS, or WAAPI (`element.animate`) — those stay off the main thread.
- Springs (Motion) are for drag/gesture interactions that can be interrupted mid-motion; they keep velocity where CSS restarts. Keep bounce subtle (0.1–0.3) and out of most UI.

## 6. Accessibility

- Reduced motion means *fewer and gentler*, not zero: keep opacity/color, remove movement. Duration tokens already zero out globally — see §2.
- Gate hover animations behind `@media (hover: hover) and (pointer: fine)` — touch devices fire hover on tap.

## 7. Review checklist

When reviewing animation code, output a single markdown table with `| Before | After | Why |` columns, one row per issue. Check for:

| Issue | Fix |
| --- | --- |
| `transition: all` | Name exact properties, or use a `--transition-*` pattern |
| Raw `cubic-bezier(...)` / raw `ms` values | System B tokens (`--ease-*`, `--duration-*`) |
| `scale(0)` entry | `scale(0.95)` + `opacity: 0` |
| `ease-in` anywhere | `var(--ease-out)` or per the tree in §3 |
| `--ease-linear` on constant motion | CSS keyword `linear` |
| `transform-origin: center` on popover | Trigger-anchored origin var (modals exempt) |
| Animation on keyboard action | Remove it |
| UI duration > 300ms outside CINEMATIC intent | `--duration-subtle`/`--duration-slow` |
| Hover animation without media query | `@media (hover: hover) and (pointer: fine)` |
| Keyframes on rapidly-triggered element | CSS transitions |
| No `:active` press feedback on pressable | `scale(var(--scale-press))` |
| Same enter/exit speed on hold patterns | Exit faster than enter |
| List items all appear at once | 30–80ms stagger |
