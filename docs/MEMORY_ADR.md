# MEMORY ADR — Split Product Memory Workflows from Internal AgentOS WDK

> Issue: JOV-2705
> Status: Accepted
> Date: 2026-06-15
> Parent: JOV-2704 (memory-ship-v0-studio-session-memory-loop)

## Decision

Memory workflows split into two distinct runtime paths:

1. **Internal AgentOS/Hermes/Ruflo experiments** — Use the existing WDK/Vercel Workflow proof path. Trigger.dev remains installed only if WDK fails durability, retry, queue, or operator visibility requirements.

2. **Customer-facing product memory workflows** — Use Trigger.dev behind a `WorkflowRunner` interface. This isolates customer workflows from internal experiment tooling.

3. **Target product harness** — OpenAI Agents SDK behind `AgentHarness`. Vercel Workflow/WDK serves internal orchestration only.

## Context

### Current State

AgentOS v1 currently uses Vercel Workflow/WDK as the primary durable coordinator (per JOV-1922 ADR). The `AGENT_OS_ARCHITECTURE.md` document defines this as the internal control-plane path.

### Why Split?

Memory workflows have different requirements than internal agent orchestration:

| Aspect | Internal AgentOS | Product Memory Workflows |
|--------|------------------|----------------------|
| Runtime | Vercel Workflow/WDK | Trigger.dev |
| Purpose | Experiment/proof | Customer-facing |
| Durability | Local dry-run sufficient | Production-grade required |
| Visibility | Internal operators | Customer observable |
| SDK Target | n/a | OpenAI Agents SDK |

### Related Issues

- JOV-2704 — Parent memory-ship epic
- JOV-1945 — Trigger.dev local worker POC (fallback runtime)
- JOV-3081 — Headroom context compression evaluation (inference cost/margin)
- JOV-1922 — AgentOS architecture decision (this extends it for memory)

## Interface Definitions

### WorkflowRunner (Abstract)

```typescript
// apps/web/lib/workflows/workflow-runner.ts
interface WorkflowRunner {
  run(workflowId: string, input: unknown): Promise<WorkflowResult>;
  getRun(runId: string): Promise<RunStatus>;
}
```

### Implementations

- `WDKWorkflowRunner` — Vercel Workflow/WDK for internal experiments
- `TriggerWorkflowRunner` — Trigger.dev for production memory workflows

The `AgentHarness` class selects the appropriate runner based on configuration.

## Implications

### File Structure

```
apps/web/lib/workflows/
├── workflow-runner.ts      # Abstract interface
├── wdk-workflow-runner.ts  # WDK implementation
└── trigger-workflow-runner.ts # Trigger.dev implementation
```

### Configuration

- Internal paths: `VERCEL_WORKFLOW_SECRET` (existing)
- Customer paths: `TRIGGER_API_KEY` with task-level secrets

### Migration Path

Existing memory workflow code in `apps/web/lib/memory/` should be reviewed:
- Internal/experimental code → WDK path
- Customer-facing code → Trigger.dev path behind WorkflowRunner interface

## References

- [AGENT_OS_ARCHITECTURE.md](./AGENT_OS_ARCHITECTURE.md) — Primary AgentOS control plane decision
- JOV-2704 — Memory ship epic
- JOV-1922 — AgentOS architecture ADR