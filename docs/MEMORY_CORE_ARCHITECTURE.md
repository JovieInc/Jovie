# Memory core architecture — retired pointer

> **Retirement notice (2026-09-02):** Trigger.dev and Hermes are retired. The accepted writeup that used to live here is git history of this path. Runner selections in that writeup are not current. See [`docs/operations/SUMMER_RUNTIME_RETIREMENT.md`](./operations/SUMMER_RUNTIME_RETIREMENT.md).

> Issue: JOV-2705
> Status: retired pointer
> Import boundaries: [`docs/MEMORY_ADR.md`](./MEMORY_ADR.md)

## Current

Creator-facing product memory and the old internal AgentOS control plane are different code. Product memory runs from `apps/web/lib/workflows/memory/studio-session-loop.ts` through `AgentHarness`. The cognition harness recorded for #12498 is `eve`.

## Do not

Do not read this file as permission to keep WDK, Trigger.dev, or Hermes in the path. `docs/AGENT_OS_ARCHITECTURE.md` is a pointer, not a control plane to rebuild.
