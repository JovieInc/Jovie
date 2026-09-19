# Vercel agent-skills coverage map

Owner: ops. Issue: JOV-6188. Reviewed: 2026-09-12.

Source review of [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
`063bee94c3f4df8453406c830b0a7df0f2860278` against Jovie `main`. Installed keep
pins stay at `f8a72b9603728bb92a217a879b7e62e43ad76c81`. This map is the
rule-level owner for adopt / fold / exclude. Already-covered rules remain
references only.

gbrain-unavailable at review time; owners below are from repo evidence
(`skills-lock.json`, `.claude/rules/gstack.md`, design and performance skills).

## Catalog

| Upstream skill | Disposition | Jovie owner |
|---|---|---|
| `react-best-practices` | KEEP reference | `vercel-react-best-practices` + Jovie overlays |
| `composition-patterns` | KEEP reference | `vercel-composition-patterns` + Jovie overlays |
| `use-ai-sdk` (`vercel-labs/ai`) | KEEP | `ai-sdk` + `apps/web/lib/ai/sdk.ts` |
| `vercel-optimize` | FOLD scanner-only specialization | `jovie-performance-hardening` / `/perf-loop` |
| `web-design-guidelines` | FOLD uncovered checks | `/design-canonical` then `/design-review` |
| `writing-guidelines` | EXCLUDE product skill | pinned handbook only; `canon/VOICE.md` |
| `vercel-cli-with-tokens` | REJECT | `/ship`, Doppler, existing Vercel link |
| `deploy-to-vercel` | REJECT (claimable) | `/ship`, `docs/PR_FLOW.md` |
| `react-native-skills` | REJECT | `.claude/rules/ios.md`, `.claude/rules/macos.md` |
| `react-view-transitions` | DEFER unscoped | `design-canonical` `MOTION_INTENSITY` |

Allowlist deny is enforced by `pnpm run skill-governance:check`.

## KEEP: `react-best-practices` (pin `f8a72b9`)

Already-covered. Do not re-home these rules. Jovie overlays stay: TanStack
Query, measure through `jovie-performance-hardening`, tenant-safe caches, no
inline hydration scripts / `suppressHydrationWarning` without CSP tests.

| Upstream rule | Owner | Note |
|---|---|---|
| `async-cheap-condition-before-await` | `vercel-react-best-practices` | reference |
| `async-defer-await` | `vercel-react-best-practices` | reference |
| `async-parallel` | `vercel-react-best-practices` | reference |
| `async-dependencies` | `vercel-react-best-practices` | reference |
| `async-api-routes` | `vercel-react-best-practices` | reference |
| `async-suspense-boundaries` | `vercel-react-best-practices` | reference |
| `bundle-barrel-imports` | `vercel-react-best-practices` | reference |
| `bundle-analyzable-paths` | `vercel-react-best-practices` | reference |
| `bundle-dynamic-imports` | `vercel-react-best-practices` | reference |
| `bundle-defer-third-party` | `vercel-react-best-practices` | reference |
| `bundle-conditional` | `vercel-react-best-practices` | reference |
| `bundle-preload` | `vercel-react-best-practices` | reference |
| `server-auth-actions` | `vercel-react-best-practices` + `.claude/rules/auth.md` | reference |
| `server-cache-react` | `vercel-react-best-practices` | reference |
| `server-cache-lru` | `vercel-react-best-practices` | tenant-safe overlay |
| `server-dedup-props` | `vercel-react-best-practices` | reference |
| `server-hoist-static-io` | `vercel-react-best-practices` | reference |
| `server-no-shared-module-state` | `vercel-react-best-practices` | tenant-safe overlay |
| `server-serialization` | `vercel-react-best-practices` | reference |
| `server-parallel-fetching` | `vercel-react-best-practices` | reference |
| `server-parallel-nested-fetching` | `vercel-react-best-practices` | reference |
| `server-after-nonblocking` | `vercel-react-best-practices` | reference |
| `client-swr-dedup` | overlay only | Do not introduce SWR |
| `client-event-listeners` | `vercel-react-best-practices` | no SWR subscription |
| `client-passive-event-listeners` | `vercel-react-best-practices` | reference |
| `client-localstorage-schema` | `vercel-react-best-practices` | reference |
| `rerender-*` (15 rules) | `vercel-react-best-practices` | reference |
| `rendering-hydration-no-flicker` | overlay | no inline hydration scripts |
| `rendering-hydration-suppress-warning` | overlay | tests required |
| remaining `rendering-*` / `js-*` / `advanced-*` | `vercel-react-best-practices` | reference |

## KEEP: `composition-patterns` (pin `f8a72b9`)

Already-covered. Boolean-prop guidance is an API-design heuristic, not a ban.
`DESIGN.md` wins for UI taste.

| Upstream rule | Owner | Note |
|---|---|---|
| `architecture-avoid-boolean-props` | overlay | heuristic, not a ban |
| `architecture-compound-components` | `vercel-composition-patterns` | reference |
| `state-decouple-implementation` | `vercel-composition-patterns` | reference |
| `state-context-interface` | `vercel-composition-patterns` | reference |
| `state-lift-state` | `vercel-composition-patterns` | reference |
| `patterns-explicit-variants` | `vercel-composition-patterns` | reference |
| `patterns-children-over-render-props` | `vercel-composition-patterns` | reference |
| `react19-no-forwardref` | `vercel-composition-patterns` | reference |

## KEEP: `ai-sdk`

Existing skill. Route application calls through `apps/web/lib/ai/sdk.ts`. Do
not install or upgrade `ai` unless the task is dependency work.

## `vercel-optimize` review

Do **not** install the skill, its scripts, or its outbound collector.

### Scripts and outbound ops

| Surface | Audit | Disposition |
|---|---|---|
| `scripts/collect-signals.mjs` | `vercel metrics`, `vercel usage`, `vercel contract`, `vercel api` | EXCLUDE. Outbound account reads. |
| `scripts/scan-codebase.mjs` | AST scanners, no Vercel auth | FOLD traffic-independent items only |
| `scripts/gate-investigations.mjs` | ranks by route metrics | EXCLUDE. Needs Observability Plus |
| `scripts/deep-dive.mjs` | follow-up `vercel metrics` | EXCLUDE |
| `lib/vercel.mjs` | CLI wrapper, `--scope` | EXCLUDE as a runner; FOLD targeting safety |
| `lib/observation-safety.mjs` | holds unverified WAF/Bot claims | FOLD principle: no unverified platform recs |
| `references/docs-library.json` | versioned citation allow-list | EXCLUDE (not wired) |

### Project / team targeting

Useful specialization folded into `jovie-performance-hardening`:

- Require an explicit project and team (`VERCEL_PROJECT_ID` + `VERCEL_ORG_ID`
  or a reviewed `.vercel/project.json`).
- Do not infer scope from `vercel whoami`.
- Stop on `PROJECT_SCOPE_UNRESOLVED` / `SCOPE_UNRESOLVED` / `PROJECT_SCOPE_MISMATCH`.
- Never put tokens in shell commands (`--token`, `VERCEL_TOKEN=...`,
  `Authorization: Bearer`).

### Observability

**HARD GATE:** do not enable Observability Plus, Speed Insights Plus, Web
Analytics Plus, or any paid Vercel product. Spend is Tim-gated.

| Path | Disposition |
|---|---|
| Route-level metric gates (`slow_route`, `uncached_route`, `cold_start`, `route_errors`, `isr_overrevalidation`, `middleware_heavy`, `cwv_poor`, `platform_bot_protection`) | Tim-gated exclusion. Requires Observability Plus. Do not wire on. |
| `references/observability-plus.md` "Enable and re-run" | Tim-gated exclusion. Do not present as an agent action. |
| `--continue-without-observability` scanner-only | Allowed as a local hunt-list idea only. Not a second skill. |
| Fluid Compute / BotID / WAF paid add-ons | Tim-gated exclusion |

### Folded scanner-only specialization

These enter the existing performance hunt list. They still need a baseline and
same-method remeasure. They do not authorize repo-wide anti-pattern greps.

- Production source maps
- Unoptimized `next/image`
- Large static assets in `public/`
- Over-broad middleware matchers
- `force-dynamic` on routes that can be static
- Candidate-bound file reads (inspect only files implicated by a measured bottleneck)
- Cost claims use magnitude, never invented `$N/mo`

## `web-design-guidelines`

The upstream skill fetches mutable `main`. That fetch is forbidden. The
handbook is pinned at
`docs/vendor/vercel-labs/web-interface-guidelines/command.md`.

Uncovered checks (forms / overflow / media / l10n / browser / a11y gaps) are
folded into
`.agents/skills/gstack/design-review/references/web-interface-gaps.md`.
One canonical path: `/design-canonical` then `/design-review`. No parallel
skill authority.

Already covered in existing Phase 3 categories (references only):
focus-visible, `prefers-reduced-motion`, `transition: all`,
transform/opacity-only motion, truncation, lazy images + dimensions,
`safe-area-inset`, `user-scalable=no`, hover/focus/disabled, WCAG contrast,
empty/error/loading states.

## Explicit REJECT

| Skill | Why |
|---|---|
| `vercel-cli-with-tokens` | `printenv VERCEL_TOKEN`, greps `.env`, skips deployment URL verification |
| `deploy-to-vercel` | Claimable no-auth upload; "do not curl/fetch the deployed URL" |
| `react-native-skills` | Expo / Reanimated / FlashList. Jovie mobile is SwiftUI iOS + Electron Mac |
| Unscoped `react-view-transitions` | "Implement all applicable patterns" authorizes app-wide animation. Defer until a named interaction. Never authorize app-wide animation |
| `writing-guidelines` as a product skill | Optional docs-only later. Preserve Jovie voice |

## Product catalog (out of scope)

Do not edit `PUBLIC_SKILL_REGISTRY` / `SKILL_REGISTRY`, `skills_catalog`,
featured-vs-silent product catalog, chat tool inventory, or
`apps/web/lib/agents/registry.ts`. JOV-6188 is engineering agent-skills
governance only.

## Rails

Protect JovieInc/Jovie#17453. HOLD #17156. Leave #17511 and #17521. No Tim
merge-queue enroll. No Observability Plus spend.

Deferred candidates (do not implement in this PR):
- JOV-6193 writing-guidelines docs-only pin promotion
- JOV-6194 scoped react-view-transitions for a named interaction
