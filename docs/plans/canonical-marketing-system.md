<!-- /autoplan restore point: /Users/timwhite/.gstack/projects/realtime-voice-chat-3/codex-jovie-canonical-marketing-system-autoplan-restore-20260808T000000.md -->

# Jovie canonical marketing system

## Scope

Jovie web marketing only. Log Your Body, iOS/macOS, authenticated app screens,
and Pencil canvas editing are out of scope; another agent owns the canvas. This
branch establishes the code-side one-to-one contract.

## Audit

- Current manifest: 28 entries (18 recipe routes, 10 sanctioned exemptions),
  one explicit legacy redirect (`/waitlist` → `/start`). Dynamic globs now use
  concrete fixtures for compare, alternatives, blog, and render surfaces.
- Existing recipes, sections, shell layouts, and Storybook were not fully
  enforced: runtime allowed duplicate/unregistered composition, and catalog
  coverage could pass on title/comments. Prior audit evidence also found
  partial shell adoption and unproven visual parity.
- Route health is therefore a prerequisite for Pencil import, not migration
  proof. Capture uses the existing toolbar/E2E flags; production diagnostics
  are unchanged.

## Contract

```text
tokens/motion/accents → registry → composition validator → shared shell
                                      ↘ Storybook ↔ Pencil
```

Agents query `MARKETING_COMPONENT_REGISTRY`; genuinely new components must be
registered and storied in the same change. Compositions require one registered
hero first, reject unknown ids/variants, and enforce registered cardinality.

## Changes

| Surface | Result |
| --- | --- |
| Registry/spec | Typed server-safe shell/section/variant projection from `sections.ts` |
| Composition | Runtime version, hero, id/variant, and duplicate validators |
| Storybook | Real CSF export required for every registered section |
| Routes | Concrete health targets; wildcard/redirect contracts fail closed |
| E2E | Anonymous 28-target status/boundary/auth/runtime/console/chrome gate |
| Docs | Agent rules, architecture source path, migration/handoff record |

## Verification

- Route gate: **28 passed**; no same-origin 4xx/5xx, failed requests, page
  errors, console errors, error/auth walls, or dev chrome. `/waitlist → /start`
  is the only declared redirect. Existing `Button/whitePill` deprecation
  warnings remain visible but are not console errors.
- Focused Vitest: **55 passed** across registry, composition, route-health,
  Storybook catalog, and recipe manifest. Storybook build, web production
  typecheck, Biome, and `git diff --check`: **passed**.
- Repository `typecheck:tests` is still red on unrelated baseline failures;
  filtered output contained no new-file errors.

## Migration matrix

| Stream | Routes | State |
| --- | --- | --- |
| Core | `/`, `/new`, `/pricing`, artist profiles, feature pages, `/launch` | health green; parity/compiler pending |
| Content | about/support/compare/alternatives/blog/category | health green; registry bindings pending |
| Special | blog detail/author, changelog, demo, investors, renders | gated; exemptions/visual parity pending |
| Pencil | registered shells/sections/variants | earliest handoff after gates; canvas owned elsewhere |

**Earliest safe Pencil handoff:** registered-component exploration is safe now:
route health, registry/Storybook invariants, focused tests, and web typecheck
pass. This does not claim page parity.

**Full canonical completion:** not yet; all 28 routes must compose from the
registry/compiler, then pass token/motion/accent, responsive/a11y/visual, and
round-trip Pencil parity gates with exemptions retired or approved.

## Review record

GBrain surfaced historical JOV-4491/JOV-4063 work and a separate Pencil owner;
no current overlap receipt was available. This branch preserves other
worktrees. User scope supplied the decisions; the interactive review tool was
unavailable, so no new scope choice was invented. CEO/design/engineering/devex
requirements were loaded. Verdict: foundation reviewable; migration follow-up.
