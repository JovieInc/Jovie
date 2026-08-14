# Jovie — Agent Operating Manual

Read [`/canon/OPERATING_SYSTEM.md`](canon/OPERATING_SYSTEM.md) first: it defines **how to think**; this file defines **how to execute**. If they conflict, the operating system wins.

Before starting, answer: current bottleneck, evidence, success metric, expected improvement. If unknown, gather evidence first.

Controller map for AI agents. `AGENTS.md` symlinks here. Read the scoped rule for your topic before editing. Detail lives in `/canon`, `.claude/rules/*`, and `docs/`.

## Operating Principles

- Smallest correct change; inspect existing patterns first.
- Server-side code, typed contracts, existing package boundaries.
- Don't invent commands, env vars, routes, tables, services, or tokens.
- Report exact check failures — don't hide them.
- Ask before destructive ops (data deletion, irreversible migrations without CI guard, credential changes, prod scripts). Auth/payment edits do **not** need human merge approval — CI + Migration Guard own that.
- **Decisions are systems, not events** when quantifiable: **Ship now / Re-evaluate when / Then** with unit-economics triggers; tag `EVENT:` for taste/identity/security permanence. No "later"/"future work" without a Linear ID → [`.claude/rules/code-style.md`](.claude/rules/code-style.md).

Company constitution: [`/canon/OPERATING_SYSTEM.md`](canon/OPERATING_SYSTEM.md). Domain canon: [`PRODUCT`](canon/PRODUCT.md), [`ENGINEERING`](canon/ENGINEERING.md), [`DESIGN`](canon/DESIGN.md), [`MARKETING`](canon/MARKETING.md), [`VOICE`](canon/VOICE.md). Existing operating principles remain subordinate implementation canon: [`docs/company/operating-principles.md`](docs/company/operating-principles.md).

## Agent Role Boundary

Set `JOVIE_AGENT_PROFILE` before editing. Non-coding profiles (`default`, Chief, `cfo-milan-v2`, `founder-os`, `code-orchestrator`) dispatch and verify — never code/commit/push/merge/repair CI. `coder` implements assigned manifests. `no_agent` runs deterministic scripts only. Full contract: [`.claude/rules/linear.md`](.claude/rules/linear.md).

## Agent Coordination Preflight

Before starting any task, agents must query gbrain for both the org chart and existing work in the area. Fetch `gbrain:agent-org-chart` when available, read `shared-skills/coordination-basics/SKILL.md` when present, and run a targeted ownership/current-priorities query for the task. If another agent owns the area, delegate through the coordination inbox instead of starting overlapping work. If gbrain is unreachable, stop and alert with a `system-blocker`; do not proceed without the coordination check.

## Pen Workspace File Lock

Before any Pen mutation, resolve one versioned workspace profile from [`scripts/agent/pen-workspace-locks.json`](scripts/agent/pen-workspace-locks.json) and establish one writer through the coordination preflight. The active editor path must match the profile's non-overridable canonical path before and after every mutation batch. Recovery files, backups, source-backed read-only files, and side files are evidence-only until a separately approved reconciliation.

**Live-canvas attach.** If the target canvas is already open, attach with `pen interactive -a desktop` (optional `-i` only when it is the locked canonical path). One live canvas per job. Do not File → New / Open / Open Recent / Save As, rename, close, or switch documents. Do not spawn a second MCP. Do not pass `--out` or `save({path})` — those invent a second file. Do not copy `~/.pencil/backup` or any Pencil backup over the live file.

**Dirty/unsaved is not a bail.** A live-canvas write is valid work. Do not stop because the file is dirty. Do not require a save receipt after every edit. Do not present Save/Don't Save dialogs to the human as the workflow.

**Batch close / handback.** Call `save()` with no path argument on the attached live canvas. Then prove disk persist with [`scripts/agent/pen-live-canvas-persist.mjs`](scripts/agent/PEN_LIVE_CANVAS.md): the locked canonical file's mtime must move. `save()` printing `Saved` is not persist. `pen-save-receipt/v1` remains editor-state evidence at handback; it does not replace the mtime gate. Autosave, a visible canvas change, an MCP success response, or an opaque backup alone is insufficient.

Cold-manifest verification uses [`scripts/agent/pen-cold-readback.mjs`](scripts/agent/PEN_COLD_READBACK.md). The pinned Pen runtime has no native non-evaluating complete semantic inspector, so the command must fail closed with `pen-cold-readback/v2` and `safe_cold_manifest_unavailable` before launching Pen or opening, reading, hashing, creating, or writing any `.pen` document. `scripts/agent/pen-promotion-gate.mjs` therefore preserves `live_readback_only`; `cold_round_trip_verified` is unreachable until a separately reviewed native inspector contract exists.

After any Pen/renderer/MCP restart, disconnect, crash indication, or unexpected active-path change, invalidate the writer and batch; do not save, discard, resume, or switch. If Pen displays Save/Don't Save, choose **Cancel**. If no dialog is displayed, leave Pen untouched. In either case, stop all mutations, preserve the active work, and report the lock failure. Never ask the founder to decide whether unknown agent work should be saved or discarded.

## Instruction Architecture

- `AGENTS.md` → symlink to this file. Host wrappers (`CODEX.md`, Copilot, etc.) point here — never duplicate policy.
- Stable rules → this file or `.claude/rules/*`; workflows → skills; enforcement → hooks/scripts.
- Generated skills: edit `.tmpl` sources, regenerate — don't hand-edit `SKILL.md`.
- Prefer static prefixes + variable task context later (cache-friendly). Delegate large investigations to subagents.

## Tool Versions

```bash
node --version   # MUST be 22.x (22.13+)
pnpm --version   # MUST be 9.15.4
```

Wrong versions: `nvm use 22 && corepack prepare pnpm@9.15.4 --activate`. Repo root only; `pnpm` + `pnpm turbo` (not npm/yarn/npx). Secret-bound commands via Doppler wrappers. Setup: [`.claude/rules/environment.md`](.claude/rules/environment.md).

## Hard Invariants (Hook-Enforced)

Details and remediation live in scoped rules — hooks block violations.

| Topic | Rule file |
|-------|-----------|
| Migrations, DB driver | [`.claude/rules/db.md`](.claude/rules/db.md) |
| Clerk proxy, E2E auth | [`.claude/rules/auth.md`](.claude/rules/auth.md) |
| UI, design system, marketing static | [`.claude/rules/ui.md`](.claude/rules/ui.md) |
| CSP, webhooks, secrets, entitlements | [`.claude/rules/security.md`](.claude/rules/security.md) |
| PR/ship/deploy, bot reviews | [`.claude/rules/release.md`](.claude/rules/release.md) |
| iOS native guardrails | [`.claude/rules/ios.md`](.claude/rules/ios.md) |
| TypeScript, boundaries, prior-art gate | [`.claude/rules/code-style.md`](.claude/rules/code-style.md) |
| Tests, verify-before-done | [`.claude/rules/testing.md`](.claude/rules/testing.md) |

## Repo Workflow

**PR/CI/merge flow is canonical in [`docs/PR_FLOW.md`](docs/PR_FLOW.md).** Before changing CI or merge behavior, read it.

1. Read relevant files → plan risky/multi-file work.
2. Mark Linear `In Progress` before edits ([`.claude/rules/linear.md`](.claude/rules/linear.md)).
3. Edit only task files → draft PR on first push.
4. Run narrowest verification → summarize changes, checks, risks in PR.

Skip issues labeled `human-review-required` or containing "This issue requires human review". File Linear issues for all follow-ups — no orphan "deferred" bullets.

## Files To Treat Carefully

`proxy.ts`, `drizzle/migrations/`, `apps/web/app/api/stripe|billing/`, onboarding/claim flows, `apps/web/lib/entitlements/`, `cdn-domains.ts`, design tokens, generated/schema files, marketing pages (fully static).

## Verification

- Typecheck: `pnpm --filter @jovie/web run typecheck -- --pretty false`
- Lint: `pnpm biome check --write <paths>`
- Tests: `pnpm --filter web exec vitest run <file>`
- Build when routing/config/cross-package changes
- **Layout shift audit (mandatory for UI):** no state transition may shift layout — reserve space, update tests. See [`.claude/rules/ui.md`](.claude/rules/ui.md), `DESIGN.md`, `docs/TESTING_GUIDELINES.md`.

`post-task-validate.sh` blocks on typecheck, Biome, boundaries, or affected test failures.

## Scoped Rules

Read the relevant `.claude/rules/*` file before touching that area: environment, auth, db, ui, security, release, ci-branching, testing, infra, ios, code-style, linear, gstack, swarm, hermes-air.

## Skill Routing

Match a skill → invoke it first. Full routing table: [`.claude/rules/gstack.md`](.claude/rules/gstack.md). Web browsing: `/browse` only (never `mcp__claude-in-chrome__*`). Key flows: `/ship`, `/review`, `/qa`, `/investigate`, `/autoplan`, `/perf-loop`.

## Documentation Map

| Doc | Use when |
|-----|----------|
| `canon/README.md` | Root decision hierarchy: operating system + domain canon |
| `DESIGN.md` | Operational design-system execution |
| `docs/PR_FLOW.md` | Shipping, CI tiers, taste gate |
| `docs/marketing/AGENT_GUIDE.md` | Generating or editing any marketing/landing page |
| `docs/AI_AGENT_GUIDE.md` | API routes, cron, webhooks inventory |
| `docs/company/operating-principles.md` | Product prioritization canon |
| `docs/company/PRICING-PHILOSOPHY.md` | Pricing decisions |
| `LESSONS.md` | Post-mortems from human corrections |
| `apps/web/tests/TESTING.md` | Deep test reference |
| `CODEX.md` | Codex bootstrap wrapper |

Indexes (`docs/API_ROUTE_MAP.md`, `docs/CRON_REGISTRY.md`, `docs/WEBHOOK_MAP.md`, …) are system-of-record — navigate via this map.
<!-- doc-freshness:scoped-rules-count:17 -->
