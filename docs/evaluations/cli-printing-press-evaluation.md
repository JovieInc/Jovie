# cli-printing-press Evaluation for Agent-Native CLIs (Eve / OWL)

**Date:** 2026-07-05
**Issue:** [#10929](https://github.com/JovieInc/Jovie/issues/10929) · Linear: JOV-3204
**Evaluator:** Claude (AI)
**Tool evaluated:** [mvanhorn/cli-printing-press](https://github.com/mvanhorn/cli-printing-press)
**Route:** Eve (linear-pp-cli local mirror) / OWL (connector/analytics CLI generator)

---

## Executive Summary

**Verdict: Adopt for official-API targets; block for unpublished-API sniffing.**

`cli-printing-press` solves a real agent-tooling gap — it generates token-efficient Go CLIs, Claude Code skills, and MCP servers from API documentation, and ships a local SQLite mirror variant (`linear-pp-cli`) purpose-built for compound queries. For two concrete Jovie workloads the value is immediate:

| Use case | Route | Verdict |
|---|---|---|
| `linear-pp-cli` local SQLite mirror | Eve | **Adopt** — 50 ms compound queries vs. multi-second API round-trips; direct cost/speed lever for Eve's backlog sweeps |
| Connector/analytics CLI generator for official APIs | OWL | **Conditional adopt** — accelerates the connector pipeline (#10806) for YouTube Data, IG/FB Graph, Spotify partner API; do not use for unpublished-API targets until legal/product go-ahead |
| Unpublished API sniffing (Spotify-for-Artists, Apple Music for Artists) | — | **Block** — tool does not solve auth gates or ToS exposure; those remain open product/legal questions |

---

## What cli-printing-press Does

`cli-printing-press` is an API-first CLI generator. Given a target API or website it:

1. Reads official API documentation and known community CLIs/MCPs.
2. Optionally **sniffs unpublished APIs** by inspecting network traffic (session cookies, internal endpoints).
3. Emits a token-efficient **Go CLI** with SQLite local mirror (`linear-pp-cli` pattern), a **Claude Code skill**, and an **MCP server** — all designed for agent-native consumption.

The `linear-pp-cli` variant is the flagship output: it syncs Linear's data into a local SQLite database, answering compound queries ("every blocked issue whose blocker has been stuck a week") in ~50 ms without an API round-trip per query.

---

## Eve Route: linear-pp-cli Local Mirror

### Problem it solves

Eve (Vercel `eve` agent harness — #12498) currently pays a Linear API round-trip cost on every backlog sweep. Compound queries ("blocked issues with stalled blockers", "issues open > 7 days with no assignee") require multiple serial API calls. At Eve's sweep cadence this accumulates into real latency and token budget waste.

### What linear-pp-cli provides

- **50 ms local queries** against a SQLite mirror of the Linear workspace.
- **Compound query support** — arbitrary SQL over issues, labels, states, assignees, blockers, and cycle history without the API's query limitations.
- **MCP server** — Eve can call the mirror as a tool with no extra network hop.
- **Claude Code skill** — agents invoke pre-defined query patterns from the skill.

### Sample queries the API cannot answer cheaply

```sql
-- Blocked issues whose blocker has been in-progress > 7 days
SELECT i.id, i.title, b.title AS blocker, b.updated_at
FROM issues i
JOIN blockers bl ON bl.blocked_id = i.id
JOIN issues b ON b.id = bl.blocking_id
WHERE b.state_type = 'started'
  AND b.updated_at < datetime('now', '-7 days');

-- Unassigned P1 issues open > 3 days
SELECT id, title, created_at
FROM issues
WHERE priority = 1
  AND assignee_id IS NULL
  AND created_at < datetime('now', '-3 days')
  AND state_type NOT IN ('completed', 'cancelled');
```

### Adoption plan

1. Run `cli-printing-press` against Linear's published GraphQL API to generate `linear-pp-cli`.
2. Schedule a sync cron on the Hermes Air node (already the always-on ops runner) — adds no new infra.
3. Register the generated MCP server in Eve's tool registry.
4. Replace the highest-cost Eve sweep queries with mirror calls and measure latency reduction.
5. File a Linear follow-up issue if the generated CLI needs manual query additions.

### Risks

| Risk | Mitigation |
|---|---|
| Mirror lag (sync delay) | Query freshness is ≥ sync interval (5–15 min acceptable for backlog planning); real-time state changes still go through the API |
| Linear API schema drift | Pin the generated CLI version; re-run generator on breaking schema changes |
| SQLite on Hermes Air disk | Small dataset (thousands of issues); negligible storage; add disk-usage alert |

---

## OWL Route: Connector/Analytics CLI Generator

### Problem it solves

The connector enrichment pipeline (#10806) needs agent-native CLIs for official APIs (YouTube Data, IG/FB Graph, Spotify partner API). Hand-crafting each CLI is slow and produces inconsistent token profiles. `cli-printing-press` can generate a consistent, token-efficient CLI + MCP server from the API docs directly, with the compound-query SQLite mirror pattern when offline-first queries are needed.

### What the generator provides

- **Token-efficient Go CLI** — lean binary, no heavyweight SDK overhead; agents call it as a sub-process or via the generated MCP server.
- **Claude Code skill** — pre-baked query patterns the OWL pipeline can invoke without prompt engineering each time.
- **MCP server** — compatible with Hermes/Eve tool registry.

### Candidate targets (official APIs only)

| Platform | API | Notes |
|---|---|---|
| YouTube | YouTube Data API v3 | Fully public; no sniffing needed |
| Instagram / Facebook | IG/FB Graph API | Requires app review for Creator fields |
| Spotify | Spotify Web API | Public; gated partner API for artist stats — pursue partner access |
| LinkedIn | LinkedIn API | Limited scope; evaluate when needed |

### Conditional gates before adoption per connector

1. Confirm the target has a **published, stable API** the generator can read.
2. Confirm **auth is machine-handleable** (OAuth client credentials or API key; no interactive 2FA).
3. Check **ToS for automated access** — some APIs prohibit caching/mirroring.
4. File a connector child issue under #10806 before running the generator.

---

## Critical Caveat: Unpublished API Sniffing

`cli-printing-press` can sniff unpublished APIs by capturing session traffic. This is relevant to two frequently-requested targets:

| Platform | API Status | Sniffing verdict |
|---|---|---|
| **Spotify for Artists** | Unpublished internal API | **Block** — auth requires real user session + 2FA; headless automation breaks on login; ToS violation risk on the user's account; pursue the official [Spotify gated partner API](https://developer.spotify.com/documentation/web-api) instead |
| **Apple Music for Artists** | No API — scrape only | **Block** — highest risk; no programmatic access path; any CLI would be brittle to UI changes and carries ban risk; do not build until an official API exists |

**The tool accelerates the BUILD of a sniffed CLI, but it does not solve the underlying gates:**

1. **Auth gate** — unpublished APIs require a live user session (cookies, 2FA). Headless automation breaks on any auth challenge. A generated CLI cannot bypass this.
2. **ToS/ban risk** — scraping or replaying unpublished API calls risks the **user's own account**, not a service account. The generated CLI gives Jovie deniability, not the user.
3. **Product/legal go/no-go** — these gates are not engineering decisions. They require explicit product and legal sign-off before any sniffed CLI is built or run.

---

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **cli-printing-press** (official API targets) | Generates consistent Go CLI + skill + MCP; SQLite mirror for compound queries | Go binary — separate from Node monorepo; maintenance if API schema changes | **Adopt for official APIs** |
| **cli-printing-press** (unpublished API sniffing) | Would accelerate build | Does not solve auth gates or ToS risk | **Block until legal go-ahead** |
| **Hand-crafted Node.js CLI per connector** | Stays in monorepo language | Slow to build; inconsistent token profiles; no SQLite mirror | Not recommended for new connectors |
| **Direct API calls in Eve sweep** | No extra tooling | Linear API round-trips are slow + costly at sweep cadence | Already the blocker — replaced by linear-pp-cli |
| **Graphite/Linear built-in views** | Zero engineering | Cannot answer compound relational queries across issue graph | Insufficient for Eve's query patterns |

---

## Implementation Timeline

### Phase 1: Linear mirror (Eve) — immediate

- Run `cli-printing-press` against Linear GraphQL schema → generate `linear-pp-cli`.
- Wire sync cron to Hermes Air.
- Register MCP server in Eve tool registry.
- Validate 5 high-cost sweep queries return correct results from mirror.
- Target: within 1 sprint of go-ahead.

### Phase 2: First connector CLI (OWL) — next sprint

- Choose the connector with the cleanest official API (YouTube Data v3 is the simplest).
- Run generator → review output → wire MCP server to connector pipeline.
- File child issue under #10806 for each additional connector.

### Phase 3: Scale to other official-API connectors

- IG/FB Graph, Spotify Web API.
- One connector per sprint; do not batch.

### Phase 4 (conditional): Spotify gated partner API

- Pursue Spotify Partner API access through official channels.
- Only run `cli-printing-press` against the gated API once access is confirmed.

---

## Verdict Summary

| Decision | Value | Ceiling / escalate when |
|---|---|---|
| **Adopt `linear-pp-cli` for Eve** | Immediate: ~50 ms compound queries, lower token spend per sweep | Re-evaluate if Linear changes GraphQL schema in a breaking way |
| **Adopt generator for official-API connector CLIs** | Accelerates OWL connector pipeline (#10806); consistent token profiles | Blocked per connector until: published API confirmed, auth is machine-safe, ToS reviewed |
| **Block unpublished-API sniffing** | N/A | Escalate to product + legal for explicit go/no-go before any sniffed CLI build |

**Test file for this evaluation:** `apps/web/tests/unit/docs/cli-printing-press-evaluation.test.ts`
