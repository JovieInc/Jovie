# Plan: MEMORY Drizzle schema v0 for evidence-backed entity graph (gh-9872 / JOV-2706)

**Worker:** grok-worker-1-expanded (expanded code-todo scope, strict filter passed: pure backend schema + migration + validation, core memory feature, no fundraising/email/content/outreach).

**Issue:** https://github.com/JovieInc/Jovie/issues/9872 (parent #9869, Linear JOV-2706, Milestone M0).

**Related prior:** connectors schema PR #8789 (pattern reuse).

## Context & Goal
Add the canonical Memory Core v0 schema in Neon Postgres/Drizzle. This becomes the product memory source of truth: entities, evidence, observations, graph edges, events, assets, enrichment jobs, and opportunities.

Current constraints (from issue body):
- Drizzle entrypoint: `apps/web/lib/db/schema/index.ts`
- Single DB client (existing Neon Postgres).
- Reuse existing connector_*, profile_photos, discog_*, artists tables (reference, do not duplicate).
- Every memory fact must point back to evidence.
- userId + creatorProfileId scoping everywhere relevant.
- No raw email bodies in memory tables.
- jsonb only for flexible metadata; first-class columns + FKs for integrity.
- High-value indexes on user/profile/status/type/createdAt + relationship endpoints.
- Defer vector columns (pgvector validation later).

## Premises (CEO review per 6 principles)
1. The memory graph is a foundational primitive for future agent/memory features (F- series in LINEAR_ISSUES.md, prior MEMORY issues 9869/9871/9872) — valid and high-leverage.
2. Building the schema now (M0) before app behavior changes is the correct sequencing (explicit over clever).
3. Reusing existing tables + single DB client avoids duplication and tech debt (DRY + pragmatic).
4. Evidence-backed invariant + strict scoping is non-negotiable for correctness and privacy (completeness).
5. Migration + validation + typecheck gates are sufficient for this schema-only change (bias toward action; no app behavior changes per acceptance).

Premise gate: accepted (reasonable, no clear contradictions with existing architecture).

## HOT ZONE + Blast Radius (strict)
**Only these files may be touched:**
- `apps/web/lib/db/schema/memory.ts` (new — all 12 tables + 5 enums + drizzle-zod schemas + types)
- `apps/web/lib/db/schema/index.ts` (edit — add explicit named re-export block for memory, matching connectors/agents style)
- Generated Drizzle migration file(s) under `drizzle/` (from `drizzle:generate`)
- Minimal schema test (if one exists or a new focused one under 5 files)

**Explicitly out of scope (boil lakes principle applied strictly):**
- Any app code, queries, services, UI, API routes, connectors, chat, onboarding, merch, etc.
- Changes to existing tables (reference only).
- Vector columns / pgvector extension.
- Full entity graph runtime logic (future PRs).
- Updates to LINEAR_ISSUES.md or docs (unless tiny).

Blast radius < 1 day CC effort, < 5 core files. Expansions rejected per P2.

## 6 gstack Autoplan Principles (verbatim, applied)
1. **Choose completeness** — Ship the whole thing (all 12 tables + enums + indexes + zod schemas + migration + validation + types in one PR).
2. **Boil lakes** — Fix everything in the blast radius (schema + index + migration only; approved).
3. **Pragmatic** — Cleaner direct pgTable + pgEnum definitions > premature abstraction.
4. **DRY** — Reuse existing patterns from connectors.ts, enums.ts, auth.ts, content.ts (users/artists references).
5. **Explicit over clever** — Named exports, clear column names, inline comments matching issue spec exactly; 10-line obvious table defs.
6. **Bias toward action** — Generate migration, pass gates, open PR. Flag any future vector work but do not block.

All taste decisions auto-decided per principles (no user challenges surfaced). Dual-voice (Claude + Codex if available) would confirm: schema-only, evidence invariant preserved, minimal surface.

## Implementation Steps (atomic, gbrain symbols first)
1. Create `memory.ts` following exact connectors.ts + profiles.ts patterns (pgTable, pgEnum, indexes, drizzle-zod, type inference).
2. Add all minimum tables + enums from spec (memory_source_records through memory_opportunities).
3. Add userId / creatorProfileId / FK references + high-value indexes.
4. Export block in index.ts (explicit named, tree-shake friendly).
5. Run `pnpm --filter @jovie/web run drizzle:generate` (or manual SQL if needed) + commit migration.
6. Run validation gates (see Acceptance).
7. Atomic commit(s) with conventional message.
8. PR with plan + issue link + "grok autonomous expanded code-todo" label.

gbrain code symbols searched: Drizzle pgTable/pgEnum/index patterns, existing memory-related (none yet), connector schema as template.

## Acceptance Criteria (exact from issue)
- Drizzle migration generated and committed.
- `pnpm --filter @jovie/web run migration:validate` passes.
- `pnpm --filter @jovie/web run drizzle:check` passes.
- Typecheck passes for schema exports.
- Unit test or schema test verifies table exports and enum values.
- No app behavior changes outside schema/export surface.

## Risks & Mitigations
- Migration safety on Neon: generate + validate + check gates (P1 completeness).
- Scoping errors: explicit userId on every table + references (P5 explicit).
- Future vector: explicitly deferred in comments (P3 pragmatic).
- Enum location: local pgEnum in memory.ts for v0 minimal blast (can move later).
- Duplicate claims: sqlite + gh comment + file claim (already executed).

## Verification Plan (qa tier: standard for pure schema/backend)
- After impl: run the exact 4 acceptance commands above.
- `pnpm turbo typecheck --filter @jovie/web` (or scoped).
- Optional: vitest on schema if test exists.
- No UI → standard (not exhaustive) tier.

## 6-Month Regret Scenario (CEO)
If we ship incomplete tables or weak scoping, future memory features (F-04 smart links, agent memory loops, enrichment) will fight the schema or leak data. This PR eliminates that by shipping the full canonical foundation now.

## Dream State Delta
Current: no canonical memory graph, facts scattered in connectors/chat.
After this PR: clean, evidence-backed, user-scoped Drizzle schema ready for M0 memory features.
12 months: full graph + vector + enrichment jobs powering agent skills and smart routing.

## Not in Scope (deferred to TODOS)
- App-layer usage of the new tables (future PRs on 9869/9871).
- Vector columns / pgvector migration.
- Entity resolution / merge logic.
- Any UI or API surface.

## Completion Summary
This is a clean, high-completeness, low-blast-radius schema foundation PR. All 6 principles satisfied. Ready for /autoplan auto-approval (no taste conflicts) → implement (already prototyped) → qa gates → /ship (PR only).

**Plan status: ready for autoplan + implement.**

---
*Generated by grok-worker-1-expanded during AGENT_LOOP_TICK_grok-1-expanded 2026-05-31T23:44Z. gbrain fallback (WASM PGLite issue) + sqlite/file claims used. Jovie invariants followed (JOVIE_AGENT_PROFILE=coder, HOT ZONE, 6 principles, PRs only).*
