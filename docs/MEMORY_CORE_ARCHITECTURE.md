# Memory Core Architecture — Product Memory Stack

> Issue: JOV-2705
> Status: Accepted
> Date: 2026-06-28
> Parent: [JOV-2704](https://linear.app/jovie/issue/JOV-2704/memory-ship-v0-studio-session-memory-loop) (memory-ship-v0-studio-session-memory-loop)
> Milestone: M0 — Decision + schema
> Schema: JOV-2706 (Memory Core v0 evidence-backed entity graph)
> Import boundaries: [`docs/MEMORY_ADR.md`](./MEMORY_ADR.md)

## Decision

Creator-facing product memory and internal AgentOS orchestration are **separate durable stacks** that share Neon Postgres but never share workflow runtimes:

| Surface | Durable runner | Cognition harness | Canonical store |
| --- | --- | --- | --- |
| Internal AgentOS / Hermes / Ruflo | Vercel Workflow/WDK ([JOV-1922](./AGENT_OS_ARCHITECTURE.md)) | Deterministic artifact builders + bounded agent adapters | `AgentRunArtifact` + admin ops tables |
| Customer product memory | Trigger.dev behind `WorkflowRunner` (when cross-step durability ships) | OpenAI Agents SDK behind `AgentHarness` | `memory_*` tables via `lib/memory/*` |

**Ship now (v0):** studio-session memory runs inline from `lib/workflows/memory/studio-session-loop.ts` through `AgentHarness`. WDK dry-run proof continues for operator control plane only.

**Re-evaluate when:** first production memory workflow needs cross-step resume, retry, or customer-visible run status outside a request handler — then implement `TriggerWorkflowRunner` per [`docs/MEMORY_ADR.md`](./MEMORY_ADR.md).

## Why WDK stays in AgentOS (and product memory does not use it)

AgentOS v1 accepted WDK as the **internal** durable coordinator ([`docs/AGENT_OS_ARCHITECTURE.md`](./AGENT_OS_ARCHITECTURE.md)). That proof path is still valid:

- `workflows/agent-os-dry-run.ts` compiles and emits `AgentRunArtifact` evidence for `/app/admin/ops`.
- WDK satisfies operator visibility, retry, and step boundaries for **non-customer** experiments.
- Ripping WDK out of AgentOS would stall the dry-run gate without improving creator memory.

Product memory has different constraints:

- Writes are scoped to `userId` + `creatorProfileId` with provenance on every fact.
- Durability must survive Vercel request timeouts, fan-out enrichment, and media waits.
- Customer-visible workflow state must not route through admin-only WDK compile gates.

**Therefore:** WDK remains the internal coordinator; product memory selects Trigger.dev (via `WorkflowRunner`) when inline execution is insufficient. The stacks are complementary, not contradictory.

## Product workflow boundaries

### Trigger.dev — durable product jobs

Owns:

- Cross-step resume, retry, and queue semantics for creator memory loops
- Fan-out enrichment, waits, and media-processing jobs
- Customer-visible workflow/run status (future creator UI)

Does not own:

- Canonical fact storage (delegates to Memory Core)
- Extraction reasoning (delegates to Agent SDK harness)
- Internal operator dispatch (AgentOS WDK path)

### OpenAI Agents SDK — product cognition harness

Owns:

- Extraction, planning, reasoning, and tool orchestration behind `AgentHarness`
- Structured outputs that map to Memory Core entities and observations

Does not own:

- Durable job scheduling (Trigger.dev)
- Long-term canonical storage (Memory Core / Neon)
- Operator gate evidence (AgentOS WDK)

Until Agents SDK migration completes, the existing **AI SDK Gateway** path remains valid for chat and simple structured extraction in non-memory surfaces.

### Memory Core — canonical memory store

Owns:

- Evidence-backed entity graph in `apps/web/lib/db/schema/memory.ts` (12 tables, JOV-2706)
- Ingest, graph, enrichment, and review in `apps/web/lib/memory/*`
- Permissions, provenance, and creator-scoped read APIs under `app/api/memory/*`

Does not own:

- Workflow durability (Trigger.dev)
- Internal operator artifacts (`AgentRunArtifact`)
- Session/founder recall (`MEMORY.md`, gbrain) or design-lab taste memory

## v0 shipped target: studio-session memory loop

The v0 loop is the reference product memory workflow:

```
apps/web/lib/workflows/memory/studio-session-loop.ts
  → AgentHarness (lib/agents/agent-harness.ts)
  → MemoryStore (lib/memory/*)
  → memory_* tables
```

- Gate: `MEMORY_STUDIO_SESSION_V0` feature flag
- Triggered inline from demo scripts, cron hooks, or API routes — **not** AgentOS WDK
- Full evidence/provenance on every fact (source records + observations)
- No social/write scopes in v0

Future production durability wraps the same entrypoint with `TriggerWorkflowRunner` without changing Memory Core contracts.

## Technology decision table

| Technology | Role in Jovie memory stack | Verdict |
| --- | --- | --- |
| **Trigger.dev** | Durable product memory jobs, retries, fan-out, waits, customer-visible run state | **Selected** for product `WorkflowRunner` when inline execution is insufficient |
| **Vercel Workflow / WDK** | Internal AgentOS dry-run, operator gate evidence, Hermes/Ruflo dispatch visibility | **Keep** for control plane only; never product memory runner |
| **Cloudflare Workflows** | Alternative edge-durable orchestration | **Deferred** — no Neon/Drizzle integration path aligned with current Next.js deploy model |
| **Composio** | Third-party tool/action composition layer | **Deferred** — product memory v0 uses bounded in-repo tools via AgentHarness |
| **Honcho** | Session/persona memory SaaS | **Deferred** — not canonical; Neon `memory_*` is SoT |
| **Graphiti / Zep** | External temporal knowledge graphs | **Deferred** — not canonical memory; may inform enrichment patterns only |
| **Anthropic Managed Agents** | Hosted agent runtime | **Deferred** for product memory — Jovie-owned harness + provenance required |
| **OpenAI Agents SDK** | Product agent harness behind `AgentHarness` | **Selected** target for extraction/planning; AI SDK Gateway remains interim for chat/simple extraction |

### Explicitly deferred as canonical memory

The following are **not** Jovie's canonical memory store in v0–v1:

- Graphiti / Zep external knowledge graphs
- Honcho session memory
- Anthropic Managed Agents memory surfaces
- Agent session memory (`MEMORY.md`, gbrain founder recall)
- AgentOS design-lab taste memory (`lib/agent-os/design-lab/taste-memory.ts`)

Neon Postgres + Drizzle `memory_*` schema remains the single source of truth for creator product memory.

## Configuration

| Concern | Gate / secret |
| --- | --- |
| Internal WDK | `AGENT_OS_WORKFLOWS_ENABLED`, Vercel Workflow compile |
| Product Trigger.dev (future) | `TRIGGER_API_KEY`, task-scoped secrets; isolated from admin routes |
| Studio-session v0 | `MEMORY_STUDIO_SESSION_V0` feature flag |
| Memory store | Neon Postgres via existing `lib/db` connection |

## Linear triage — AgentOS / Trigger / WDK issues

| Issue | Disposition | Notes |
| --- | --- | --- |
| JOV-1922 | **Still valid** | Internal AgentOS WDK ADR; unchanged by product memory split |
| JOV-1901 | **Still valid** | Automation audit; see updated §0 product-memory note in [`AUTOMATION_AUDIT.md`](./AUTOMATION_AUDIT.md) |
| JOV-1945 | **Still valid** | Trigger.dev local worker POC — now scoped to **product** `WorkflowRunner`, not AgentOS fallback |
| JOV-2704 | **Parent epic** | memory-ship-v0-studio-session-memory-loop |
| JOV-2705 | **This doc** | Architecture decision + runtime split |
| JOV-2706 | **Still valid** | Memory Core schema (12 tables) |
| JOV-3081 | **Still valid** | Headroom context compression (inference cost) |
| AgentOS "install Trigger if WDK fails" criteria ([AGENT_OS_ARCHITECTURE.md](./AGENT_OS_ARCHITECTURE.md) §Trigger Fallback) | **Superseded for product memory** | Product path selects Trigger.dev directly; WDK-failure fallback applies to **internal** coordinator only |

Issues proposing WDK as the durable runner for creator memory ingestion should be closed or re-scoped to internal operator experiments.

## Related docs

- [`docs/MEMORY_ADR.md`](./MEMORY_ADR.md) — import-boundary guardrails and forbidden couplings
- [`docs/AGENT_OS_ARCHITECTURE.md`](./AGENT_OS_ARCHITECTURE.md) — internal control plane
- [`apps/web/lib/db/schema/memory.ts`](../apps/web/lib/db/schema/memory.ts) — product memory schema
- [`apps/web/tests/unit/memory/memory-adr-contract.test.ts`](../apps/web/tests/unit/memory/memory-adr-contract.test.ts) — regression guardrail