---
name: make-it-feel-better
description: >
  Encode Jovie UI-feel judgment so new UI inherits polish. Use when polishing
  product UI, reviewing interaction quality, or adding visual QA gates.
  Complements design-canonical; focuses on feel, motion, density, and
  machine-checkable anti-patterns (JOV-3371).
---

# make-it-feel-better

Jovie’s own UI-feel skill (reimplemented in our words — do not vendor external
unlicensed skill markdown). Pair with `design-canonical`, `DESIGN.md`,
`.claude/rules/ui.md`, and `.claude/rules/motion.md`.

## When to run

- Before shipping UI polish PRs
- When a surface feels “almost right” but not premium
- When adding interactions, lists with numbers, headings, or hit targets

## 16 principles (compressed)

1. **Subtract first** — remove chrome before decorating.
2. **One hierarchy** — one primary action cluster, one heading per section.
3. **Quiet density** — Linear-like; small type, restrained weight.
4. **Token everything** — color, space, radius, motion from System B.
5. **States are design** — default / hover / focus-visible / active / disabled / empty / loading / error.
6. **No decorative hover motion** — color/opacity/border only; spatial motion only for real spatial UI.
7. **Press is tactile** — `scale(var(--scale-press))` on pressables when motion helps.
8. **Cinematic only for reveals** — drawers, audio bar, modals: `duration-cinematic ease-cinematic`.
9. **Never `transition: all`** — name properties; use `--transition-*`.
10. **Never enter from `scale(0)`** — use ≥ `0.95` + opacity.
11. **Ease-out for entry** — never ease-in for UI.
12. **Tabular nums for changing numbers** — prices, timers, counters.
13. **Balance headings** — `text-balance` / `text-wrap: balance` on display headings.
14. **Hit targets ≥ 40×40** — enlarge with invisible padding/`before:` if visual is smaller.
15. **No `will-change: all`** — only name needed properties; prefer none.
16. **Layout shift zero** — reserve space across states (mandatory).

## Review checklist

| Check | Pass when |
| --- | --- |
| Hierarchy | One clear title + one action cluster |
| Tokens | No new arbitrary colors/ms/cubic-bezier |
| Motion | Purpose + tokens; reduced-motion ok |
| States | All 6+ visual states enumerated |
| Type | Title Case labels; sentence body; balance on display |
| Numbers | `tabular-nums` on live/changing numerals |
| Hit area | Interactive ≥ 40×40 CSS px |
| Contrast | WCAG AA for text on surface |
| Evidence | Screenshot or unit/layout guard |

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Nested cards on cards | Flatten; use `variant='flat'` / spacing |
| `transition-all` | Explicit properties + DS duration/ease |
| Button styles on `<a>` | Use `@jovie/ui` `Link` / `asChild` |
| Duplicate page title in toolbar | Breadcrumb owns title |
| Raw hex on homepage bands | Scoped tokens + contrastRatio test |
| Hover lift/scale | Ban; keep press only |

## Machine gates (CI)

Deterministic subset is enforced by:

- `apps/web/eslint-rules/no-raw-motion-values.js` — `transition-all`, raw ms, ease-in, scale(0), decorative hover motion, `will-change: all`
- `apps/web/tests/unit/design-system/*-ratchet.test.ts` — shrink-only counters
- Contrast ratchet / slopcheck (sibling issues)

Non-deterministic items (optical alignment, shadow depth, stagger quality) feed the design-taste jury checklist (JOV-3214).

## Output contract

```
Feel-read: <surface> — <what felt off>
Principles applied: <ids>
Machine gates: <commands + pass>
Residual taste: <jury items or none>
```
