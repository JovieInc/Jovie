# Memory ADR — retired pointer

> **Retirement notice (2026-09-02):** Trigger.dev and Hermes are retired Jovie tooling. The decision body that used to live here is git history of this path. Do not follow it.

> Issue: JOV-2705
> Status: retired pointer

## Current

Product memory code lives in `apps/web/lib/memory` and `apps/web/lib/workflows/memory`. The cognition harness recorded for JOV-2705 / #12498 is `eve`. The import boundary is locked by `apps/web/tests/unit/memory/memory-adr-contract.test.ts`.

Internal AgentOS orchestration is not this stack. Its old control-plane writeup is `docs/AGENT_OS_ARCHITECTURE.md`, which is also a pointer.

## Do not

Do not select Trigger.dev, Hermes, Ruflo, or WDK from this file. They are not runners.
