# App-UI design brief

This is the app-surface version of
[`design-brief-template.md`](design-brief-template.md). The design gate uses
it for `ws:ui-ia` and other app-surface issues that are not marketing or
landing pages (JOV-7717). Steps 1–4, 8 and 9 follow the same rules as the
marketing template, and step 2 cites only certified capability ids. Steps 5–7
cover screens and states, canonical primitives, and viewports instead of
marketing sections, copy and imagery.

Fill it in on the issue, or link it with a single `Design brief:` line. The
brief lane drafts it on the next claim. One frontier retry then fills gaps
from canon. If steps are still missing after that, or 24h after the issue
was first held, the issue is built as `brief-auto`, and the open taste call
goes to Tim as one Ovie decision.

Headings are stable; do not rename them. Empty fields and placeholders
(`TODO`, `TBD`, `<...>`) do not count.

## 1. IA / message

What the screen communicates and what the user does next.

Completeness: one `Message` line, at least 12 characters, not a placeholder.

Message:

## 2. Certified capabilities

The only product claims the screen may make: one certified id per bullet
from `scripts/lanes/certified-capabilities.gen.json`. An unknown or
uncertified id fails the step.

Capability ids:

## 3. Outcome

Completeness: one `Outcome` line, at least 12 characters.

Outcome:

## 4. Problem → solution

Completeness: a `Problem` line and a `Solution` line, each at least 12
characters.

Problem:

Solution:

## 5. Screens and states

The UI state inventory (JOV-7713 class 6). One bullet per screen or surface:
`- new-chat: loading, empty, populated, error`. Allowed states: `loading`,
`empty`, `populated`, `partial`, `error`, `retry`, `success`, `disabled`,
`locked`, `offline`, `stale`, `refreshing`, `confirm`.

Completeness: at least one screen, and every state on a screen's bullet is
from the allowed list.

States:

## 6. Canonical primitives

The registry components the screen is built from. Use one id per bullet,
taken from `DESIGN_SYSTEM_COMPONENT_IDS` in
[`componentRegistry.ts`](../../apps/web/data/designSystem/componentRegistry.ts)
(`atom.button`, ...) or from `AppScreenComponentId` in
[`appScreens/registry.ts`](../../apps/web/data/appScreens/registry.ts)
(`component.empty-state`, ...). The gate reads the checked-in projection
`scripts/lanes/app-ui-primitives.gen.json`.

Completeness: at least one bullet, and every bullet is a known id.

Primitives:

## 7. States and viewports covered

One bullet per step-5 screen: `- new-chat: mobile, desktop`. Allowed
viewports: `mobile`, `tablet`, `desktop`, `mac-app`, `ios`.

Completeness: every step-5 screen has a bullet, and every value on it is an
allowed viewport.

Viewports:

## 8. Art direction

Completeness: exactly one `Component` line.

Component:

## 9. Creative exploration

Record one artifact: a Pen node (`node <id>`, a `.pen` path, or a URL), or
an ImageGen path or URL.

Pen:

ImageGen:

## 10. Build checklist

Not parsed for admission.

- [ ] Every step-5 state is reachable and tested; none silently falls through
- [ ] Only step-6 primitives; no route-local forks
- [ ] Step-7 viewports covered by the existing visual and interaction checks
- [ ] `DESIGN.md` and `canon/DESIGN.md` invariants hold
