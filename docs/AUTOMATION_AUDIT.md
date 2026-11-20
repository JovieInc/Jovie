# Automation audit — retired pointer

> **Retirement notice (2026-09-02):** Trigger.dev and Hermes references in the old audit are historical. Neither is an active Jovie runtime or fallback. See [`docs/operations/SUMMER_RUNTIME_RETIREMENT.md`](./operations/SUMMER_RUNTIME_RETIREMENT.md).

> Issue: JOV-2705
> Status: retired pointer

The audit body that used to live here is git history of this path. It named Trigger.dev as a product-memory runner. That selection is retired.

Product memory is `docs/MEMORY_CORE_ARCHITECTURE.md`. JOV work is `scripts/lanes/README.md`. Do not reinstall a runner from this audit.

The live Cost Anomaly Gate is `cost-anomaly-gate.yml`. It stays alert-only and never mutates production. Keep activation-gated: the declared 15-minute schedule runs only when the workflow is explicitly enabled.
