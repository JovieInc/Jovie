---
name: make-it-feel-better
description: "UI-feel pass: sixteen finishing details and a pre-ship checklist for UI that works but feels rough."
---

# Make it feel better

A working checklist of the small decisions that make an interface feel
considered. Apply it while building UI, not just at the end. This skill is
Jovie-authored guidance; it does not replace or restate the mechanical gates
listed under [Enforced guardrails](#enforced-guardrails).

Read [DESIGN.md](../../../DESIGN.md) before the first visual change in a
session. The Noir Ion system owns color, type, and spacing tokens — this skill
owns how those pieces are assembled.

## The sixteen principles

1. **Balance headings.** Multi-line headings and titles get balanced line
   breaks (`text-wrap: balance`); body copy gets `text-wrap: pretty`. Never
   ship a two-line heading where the second line is one word.
2. **Tabular numerals in data.** Any numeral a user compares or watches change
   — counts, prices, timestamps, timers — uses `tabular-nums` so digits do not
   jitter column to column or frame to frame.
3. **Concentric radii.** A child's corner radius is its parent's radius minus
   the padding between them, and never larger than the parent's. Cards inside
   cards should nest, not fight.
4. **Real hit targets.** Interactive elements are at least 40×40px (44×44 on
   touch-first surfaces) even when the visible glyph is smaller. Icon buttons
   get padding or an invisible hit layer; never a bare 16px icon.
5. **Optical alignment over mathematical.** A play triangle, a checkmark, an
   arrow in a button — center it by eye, not by bounding box. If it looks
   off-center and measures centered, it is off-center.
6. **One spacing rhythm.** Spacing comes from the scale; adjacent values only.
   No arbitrary one-off margins to nudge a single element into place — if the
   rhythm is wrong, fix the rhythm.
7. **Hierarchy through weight and scale, not decoration.** The most important
   element is biggest or boldest; secondary information recedes. Do not add
   borders, badges, or extra color to create hierarchy that typography alone
   should carry.
8. **Borders before shadows.** Separate surfaces with hairline borders or
   tonal steps first. Shadows are reserved for genuinely elevated elements
   (menus, modals, toasts) and follow one consistent light direction.
9. **Transition, don't teleport.** State changes animate — opacity, height,
   position — at 150–300ms. Elements that appear or disappear instantly feel
   like bugs. Honor `prefers-reduced-motion`.
10. **Entrances ease out, exits ease in.** Elements arriving on screen
    decelerate into place; elements leaving accelerate away. No bouncy springs
    on utilitarian UI; delight belongs in the moments that earned it.
11. **Loading states are designed, not defaulted.** Skeletons match the shape
    and size of the content they replace. A spinner centered in a layout that
    then shifts everything is worse than no spinner at all.
12. **Empty and error states are first-class.** Every list, table, search
    result, and feed has a designed zero state and a designed failure state
    with a recovery action — not a blank area or a raw error message.
13. **Text degrades gracefully.** Long names, titles, and bios truncate with
    ellipsis or `line-clamp`, inside flex/grid parents that actually permit
    shrinking (`min-width: 0`). Nothing overflows its card.
14. **Focus is always visible.** Every keyboard-reachable element shows a
    clear `:focus-visible` indicator. Removing outlines without replacing them
    is a regression, not a style choice.
15. **Disabled states stay legible and honest.** A disabled control is
    visibly disabled but still readable, and where the reason is not obvious,
    the UI says why (or what unlocks it). A dead button with no explanation is
    a dead end.
16. **No accidental scroll or clip.** Content fits its viewport: no horizontal
    overflow on mobile, no clipped text at small widths, sticky chrome does
    not cover the last row, and safe-area insets are respected on iOS.

## Pre-ship review checklist

Run this on any PR that touches user-facing UI, in this order:

- [ ] Read the diff and name every state each changed element can be in:
      loading, empty, error, disabled, focused, hovered, pressed. Confirm each
      is handled (principles 11, 12, 14, 15).
- [ ] View the changed surface at the smallest supported width and at desktop.
      Check for overflow, clipping, and cramped hit areas (4, 13, 16).
- [ ] Read every heading and numeric display the diff added. Confirm balance
      and tabular numerals where they apply (1, 2).
- [ ] Check every new container-with-content for nested radius and spacing
      rhythm (3, 6).
- [ ] Trigger every added or changed state transition and confirm it animates
      instead of snapping (9, 10).
- [ ] Keyboard-tab through the changed flow once (14).
- [ ] Run the enforced gates below on the changed files. Do not treat a pass
      as proof the surface feels good — the gates check floors, this checklist
      checks finish.

## Common mistakes

| Mistake | What it looks like | Fix per |
|---|---|---|
| Orphaned heading word | `h1` wraps leaving one word alone on line two | #1 |
| Jittering counters | Digits shift width as a count or timer changes | #2 |
| Rounded card, sharp content | Inner element radius ≥ outer, corners poke past | #3 |
| Tiny icon-only buttons | 16px glyph is the whole clickable area | #4 |
| "Centered" icon looks wrong | Bounding-box center, visually lopsided | #5 |
| Nudge margins | `ml-[13px]` style one-offs beside scale values | #6 |
| Hierarchy by ornament | Borders/badges doing the job size should do | #7 |
| Shadows everywhere | Every panel drops a shadow; nothing reads elevated | #8 |
| Snappy state changes | Menus and panels pop in with no transition | #9 |
| Springy dialogs | Bounce overshoot on a settings modal | #10 |
| Blank-then-jump load | Spinner centered, layout shifts when content lands | #11 |
| Missing empty state | Search with no results renders nothing | #12 |
| Overflowing long names | Artist name breaks the card layout | #13 |
| Invisible focus | `outline-none` with no replacement ring | #14 |
| Silent dead button | Disabled CTA, no reason given | #15 |
| Cut-off last row | Sticky footer covers final list item on mobile | #16 |

## Enforced guardrails

These rules are already mechanical. This skill points at them; do not
duplicate their thresholds or word lists here.

- **UI-feel ratchet (JOV-8197):** `pnpm --filter web lint:ui-feel`
  mechanically enforces principles 1–4 via the `@jovie/ui-feel` ESLint rule
  and `apps/web/ui-feel-ratchet.baseline.json`. New violations fail CI; if a
  count drops, lower the baseline with `-- --update`.
- **Contrast ratchet (JOV-3255):** `pnpm --filter web lint:contrast-ratchet`
  with `apps/web/contrast-ratchet.baseline.json` gates hardcoded theme colors
  and contrast violations. Design-token and color-contrast rules live there
  and in [DESIGN.md](../../../DESIGN.md) — this skill deliberately says
  nothing about color values.
- **Copy slop rules (JOV-3277):** every string this surface shows — labels,
  empty states, errors — still has to pass the `@jovie/copy` lint
  (`packages/copy`, slop/format/clarity categories). Route text through the
  `copywriting` skill; do not restate its rules in UI code or here.
