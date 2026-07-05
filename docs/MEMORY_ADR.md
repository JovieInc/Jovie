# MEMORY ADR — Split Product Memory Workflows from Internal AgentOS WDK

> Issue: JOV-2705
> Status: Accepted
> Date: 2026-06-27
> Parent: JOV-2704 (memory-ship-v0-studio-session-memory-loop)
> Schema: JOV-2706 (Memory Core v0 evidence-backed entity graph)

## Decision

Product memory workflows and internal AgentOS orchestration use **separate durable runtimes**:

1. **Internal AgentOS / Hermes / Ruflo experiments** — Vercel Workflow/WDK only. This path proves operator coordination (`AgentRunArtifact` emission, dry-run gates, admin visibility) and must never write customer memory rows or call product harness code.

2. **Customer-facing product memory workflows** — Trigger.dev behind a `WorkflowRunner` interface once production durability is required. Until that interface ships, product memory loops run inline from API routes, cron hooks, or demo scripts — **not** through AgentOS WDK workflows.

3. **Product cognition harness** — Vercel `eve` behind `AgentHarness` (founder-directed; conditional-GO per [`docs/spikes/eve-agent-sdk-fit.md`](./spikes/eve-agent-sdk-fit.md), epic [#12498](https://github.com/JovieInc/Jovie/issues/12498)), writing only to `memory_*` tables via `lib/memory/*`. This supersedes the prior OpenAI Agents SDK target; the interface is unchanged, so it is an implementation swap, not an architecture change (see Addendum). WDK coordinates internal ops; it does not orchestrate creator memory ingestion.

**Ship now:** keep the runtimes split at the module boundary; product memory never imports AgentOS WDK workflow code.
**Re-evaluate when:** first production memory workflow needs cross-step resume, retry, or customer-visible run status outside a request handler.
**Then:** implement `WorkflowRunner` with `TriggerWorkflowRunner` for product paths; keep `WDKWorkflowRunner` internal-only.

## Scope

### In scope (this ADR)

- Durable runtime selection for memory ingestion/enrichment/opportunity loops
- Import boundaries between `lib/memory/*`, `lib/workflows/memory/*`, and AgentOS WDK
- Where `AgentHarness` and `WorkflowRunner` live relative to `workflows/agent-os-dry-run.ts`

### Out of scope

- Agent session memory (`MEMORY.md`, gbrain founder recall) — see `docs/company/operating-principles.md`
- AgentOS design-lab taste memory (`lib/agent-os/design-lab/taste-memory.ts`) — internal operator artifact, not product memory
- Memory Core schema design — canonical in `apps/web/lib/db/schema/memory.ts` (JOV-2706)

## Context

AgentOS v1 selected Vercel Workflow/WDK as the internal durable coordinator ([`docs/AGENT_OS_ARCHITECTURE.md`](./AGENT_OS_ARCHITECTURE.md), JOV-1922). That decision covers **operator control plane** work: dry-run proof, gate evidence, Hermes/Ruflo dispatch visibility.

Product memory has different constraints:

| Aspect | Internal AgentOS WDK | Product memory workflows |
| --- | --- | --- |
| Runtime | `workflows/agent-os-dry-run.ts` + admin API | `lib/workflows/memory/*` → future `TriggerWorkflowRunner` |
| Data writes | `AgentRunArtifact` only; no `memory_*` tables | `memory_*` tables via `lib/memory/*` |
| Audience | Operators (`/app/admin/ops`) | Creators (scoped by `userId` + `creatorProfileId`) |
| Durability bar | Dry-run / proof sufficient | Production retry, resume, audit trail |
| SDK / harness | Deterministic artifact builders | `AgentHarness` + evidence-backed `MemoryStore` |

Mixing these paths would let internal experiment tooling mutate creator memory or couple customer workflows to admin-only WDK compile gates.

## Current file map

```
apps/web/lib/db/schema/memory.ts          # product memory SoT (12 tables)
apps/web/lib/memory/*                     # ingest, graph, enrichment, review
apps/web/lib/agents/agent-harness.ts      # studio-session harness (v0)
apps/web/lib/workflows/memory/*           # product workflow entrypoints
apps/web/app/api/memory/*                 # creator-scoped read APIs

apps/web/workflows/agent-os-dry-run.ts    # internal WDK proof only
apps/web/lib/agent-os/*                   # artifacts, gates, admin fixtures
apps/web/app/api/admin/agent-os/*         # operator workflow APIs
```

v0 studio-session loop (`lib/workflows/memory/studio-session-loop.ts`) executes inline via `AgentHarness` when `MEMORY_STUDIO_SESSION_V0` is enabled. It does not enqueue AgentOS WDK runs.

## Interface definitions (target)

```typescript
// apps/web/lib/workflows/workflow-runner.ts (not yet implemented)
interface WorkflowRunner {
  run(workflowId: string, input: unknown): Promise<WorkflowResult>;
  getRun(runId: string): Promise<RunStatus>;
}
```

Planned implementations:

- `WDKWorkflowRunner` — internal AgentOS experiments only
- `TriggerWorkflowRunner` — production product memory workflows

`AgentHarness` selects the runner from configuration; product call sites must not import `@/workflows/agent-os-dry-run` or `workflow` directives directly.

## Forbidden couplings

| From | Must not import |
| --- | --- |
| `lib/memory/*`, `lib/workflows/memory/*`, `lib/agents/agent-harness.ts`, `app/api/memory/*` | `@/workflows/agent-os-dry-run`, `@/lib/agent-os/workflows`, `workflow` package |
| `workflows/agent-os-dry-run.ts`, `lib/agent-os/workflows.ts` | `@/lib/memory/*`, `@/lib/workflows/memory/*`, `@/lib/agents/agent-harness` |

## Configuration

- Internal WDK: existing Vercel Workflow / `AGENT_OS_WORKFLOWS_ENABLED` gate
- Product Trigger.dev (future): `TRIGGER_API_KEY` + task-scoped secrets; isolated from AgentOS admin routes

## Related issues

| Issue | Role |
| --- | --- |
| JOV-2704 | Parent memory-ship epic |
| JOV-2706 | Memory Core schema |
| JOV-1922 | AgentOS architecture ADR (internal WDK) |
| JOV-1945 | Trigger.dev local worker POC |
| JOV-3081 | Headroom context compression (inference cost) |

## References

- [`docs/MEMORY_CORE_ARCHITECTURE.md`](./MEMORY_CORE_ARCHITECTURE.md) — canonical product memory stack decision (JOV-2705)
- [`docs/AGENT_OS_ARCHITECTURE.md`](./AGENT_OS_ARCHITECTURE.md) — internal control plane
- [`apps/web/lib/db/schema/memory.ts`](../apps/web/lib/db/schema/memory.ts) — product memory schema
- [`apps/web/tests/unit/memory/memory-adr-contract.test.ts`](../apps/web/tests/unit/memory/memory-adr-contract.test.ts) — import-boundary guardrail

## Addendum — `eve` adopted as the `AgentHarness` implementation (#12498)

> Date: 2026-06-30 · Source: epic [#12498](https://github.com/JovieInc/Jovie/issues/12498); recon spike [#12499](https://github.com/JovieInc/Jovie/issues/12499) → [`docs/spikes/eve-agent-sdk-fit.md`](./spikes/eve-agent-sdk-fit.md) (verdict: conditional GO)

Founder-directed pivot of the **product cognition harness** from the OpenAI Agents SDK target to Vercel's open-source `eve` agent framework. This changes only the concrete implementation **behind `AgentHarness`**; the runtime split this ADR defines is unchanged.

What does **not** change:

- **Trigger.dev owns durable customer-facing workflows (#9871 / this ADR).** `eve` is "durable by default" via Vercel Workflows; adopting that durability for product memory would silently reverse #9871. We adopt `eve` for reasoning/tool-orchestration only and keep Trigger.dev as the durable product-workflow runner. Do **not** route customer-facing durable jobs through `eve`'s Vercel-Workflows durability.
- **Internal AgentOS WDK control plane ([#8191](https://github.com/JovieInc/Jovie/issues/8191)).** Unaffected — `eve` is the product (artist-facing) agent layer, not the operator control plane.
- **Memory Core (Neon/Drizzle) as canonical store.** Unchanged.

Sequencing (per the spike's migration sketch — executed in the build epic, not this ADR): the `ai` v6→v7 bump lands first and alone (it crosses the leak-guard trust boundary in `lib/ai/sdk.ts`); first `eve` contact is a throwaway shake-out skill on an exact, frozen version pin (`eve` is pre-1.0 and churns daily); the durable studio-session loop migrates to `EveAgentAdapter implements AgentHarness` behind `MEMORY_STUDIO_SESSION_V0` only after that proves out, with `OpenAIAgentsAdapter` kept as the rollback. The synchronous artist chat (`lib/chat/run.ts`) stays on `streamText`. Skills/tools are authored as portable TS/MD we own. The new `eve` deploy unit's security model (Vercel Sandbox exec, Connect credential custody, channel-layer CSP/auth) must be scoped before it touches the paying path.