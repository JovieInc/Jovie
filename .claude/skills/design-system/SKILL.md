---
name: design-system
description: Entry point for all Jovie design-system work: art direction, tokens, components, Pen operations, Pen to code parity, certification. Use first for any UI, design, token, Pen canvas, component or visual QA task; routes to one sub-guide.
---

# design-system (single entry)

One skill for design-system work across Pen and code. Read this page, pick the row in the router, read only that guide. Do not load the legacy design skills directly unless a guide sends you there.

## Authority

1. `canon/DESIGN.md`, `DESIGN.md` and `.claude/rules/ui.md` stay the written authority. This skill extends them with the operating model below and does not replace them.
2. Tim's decisions of 2026-10-25 (they apply from now; the DESIGN.md wording that still says "Pen is a review surface" or ranks founder locks first is being amended by the Phase 2 program, so follow these where they differ):
   - Tokens live in code. `design.tokens.json` is the one token source and generates the Pen variables and the CSS. Pen never originates a token value.
   - Pen is where art direction happens. Code must match the Pen components, enforced in CI.
   - FOUNDER LOCKED / TIM-FINAL in a Pen node name is history, not a freeze. The art director may change those masters for cohesion; Tim reacts after ship.
   - Order of work: app golden path (onboarding, dashboard/releases/right rail, public profile, checkout), then Ovie, then marketing, then Mac and iOS.
   - Direction: evolve, same DNA. Dark first, current palette and type. Raise craft to Linear/Apple level: alignment, motion, density, delight.
3. Until the token flip lands, `design-system.css` still emits the live values and `design.tokens.json` is a generated projection (`pnpm design:tokens:export`). See `guides/tokens.md` for which direction applies today.
4. What is not relaxed: the Pen workspace file lock (one writer, live attach, mtime persist gate) in `.claude/rules/pen.md`, copy-leak and ICP-language checks, the shipping gates, and "agents fix red CI, never skip it".

## Router

| Task | Guide |
|---|---|
| New or changed look, layout, motion, copy on any surface; design review; variants; "make it feel better" | [guides/art-direction.md](guides/art-direction.md) |
| Add, rename, change or retire a token; color, type, radius, spacing, motion, shadow | [guides/tokens.md](guides/tokens.md) |
| Build or change a shared component; ownership; variants; right rail, status, menu, table | [guides/components.md](guides/components.md) |
| Anything that touches a `.pen` file, the `pen` CLI or `mcp__pencil__*` | [guides/pen-operations.md](guides/pen-operations.md) |
| Make code match Pen, or Pen match code; drift ledger; conformance gate; Storybook evidence | [guides/code-parity.md](guides/code-parity.md) |
| Component certificate, benchmark judgment, alignment and a11y rules, what "done" means | [guides/certification.md](guides/certification.md) |
| Landing page, hero or feature imagery on any marketing page; "make it look designed" | Landing imagery section below, spec in [docs/marketing/IMAGERY.md](../../../docs/marketing/IMAGERY.md) |
| Marketing motion and shaders: matte field, hero zoom, shell parallax, chat takeover; motion budgets; registering an effect (ASR-039) | [guides/motion.md](guides/motion.md) |

Surface-specific rules that stay where they are: `docs/marketing/AGENT_GUIDE.md` (marketing), `.claude/rules/ui.md`, `docs/design-system/state-matrix.md`, `docs/design-system/component-ownership.json`.

## Operating model (who does what)

- One art director (strongest model, one at a time) owns direction and the Pen masters. It decides; it does not do mechanical edits.
- Cheap parallel implementers (Hyperagent threads, Sonnet/Haiku, other-provider seats) change code to match a Pen master, one component or one surface per worker, in separate worktrees.
- System-1 judges (Jev/Clef through the shared system-1 router so calls are logged) do fast visual and conformance judgments on renders. Escalate to a stronger model when the measured judge accuracy is worse.
- Machines review correctness. Humans review taste, after ship, on staging and the design lane (3440x1440 ultra-wide on the office display) with Pen side by side.
- Every defect found leaves a guard (lint rule, token check, manifest entry, test, benchmark entry). Record defect -> guard in the PR.
- After editing any Pen master, run the instance drift check (`scripts/agent/pen-instance-drift.js`; steps in [guides/pen-operations.md](guides/pen-operations.md#after-editing-a-master-instance-drift-check)) and repair until it reports zero stale, orphaned or cached instances. A master change is not done while its instances still show the old design.

## Legacy skills (kept as tools, routed from the guides)

| Skill | Use now for | Not for |
|---|---|---|
| `/design-canonical` | Step 0 design read, dials, checklist and output contract (art-direction guide points here) | Defining a second design system |
| `/design-review` | Live audit and fix loop on a deployed page | Greenfield direction |
| `/design-shotgun` | Visual variants and taste feedback | Choosing tokens |
| `/design-html` | Design Lab approved-proposal HTML prototypes (dispatch code depends on it) | Product UI (product UI is code in `apps/web` and `packages/ui`) |
| `/design-consultation` | Removed from the Claude Code skill list on 2026-10-25: the system exists, a new one must not be proposed per task. The gstack source remains under `.agents/skills/gstack/` for the design-authority guard. | |

## Landing imagery (mandatory for every marketing page)

Imagery is never an afterthought. Any hero or feature section on a marketing page gets its imagery from the pipeline, in this order. Spec and bans: [docs/marketing/IMAGERY.md](../../../docs/marketing/IMAGERY.md).

1. **Pick the medium first** (`apps/web/data/marketing/factory/mediaDecision.ts`): real UI shot, abstract plate, or type only. People only if in `approved-people.json`.
2. **Real UI:** declare a shot in `apps/web/lib/screenshots/product-shots.ts` (demo route renders the live component with canary data, crop = the moment, padding, frame, `displayWidth`, sources). Never mock, never generate UI, never crop a full viewport. A shot in a device frame matches the frame's screen aspect and fills it; effective text is at least 11px.
3. **Art-direct:** compose it in `apps/web/lib/imagery/stages.ts` and render with `<ImageryStage>` (plate, hero shot, one supporting fragment, one lit wedge, declared quiet zone). Page code uses `<ProductShot>` or `<ImageryStage>`, never a raw `<img>`, `next/image` or CSS `url()`.
4. **Plates:** `pnpm --filter @jovie/web imagery:plate --id <id>` (Workers AI through `packages/api-client`, canon prompt template: matte, one accent, no text, no people, no objects).
5. **Render on Gem** (never the Mac): `pnpm --filter @jovie/web shots:render --stale` against the demo-mode server, one preflight at a time.
6. **Verify:** `pnpm --filter @jovie/web imagery:verify` runs the cold-screenshot test (a fresh judge sees only the image and answers "what is wrong with this?") and the dogfood judge rubric. Fix every major finding and re-run; an unverified asset fails CI.
7. **Ship:** stale shots, plates and stages regenerate on deploy; the guard `imagery-provenance` (`scripts/invariants/art-direction/imagery-provenance.mjs`) fails a marketing page whose hero or feature image did not come from this pipeline (shrink-only ratchet).

Before/after evidence in the PR: Pen reference, before, after, at 1440 and 390.
