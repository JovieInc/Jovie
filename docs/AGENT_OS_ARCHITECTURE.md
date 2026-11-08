# Agent OS architecture — retired pointer

> **Retirement notice (2026-09-02):** Hermes and Trigger.dev are retired Jovie tooling. This file is a pointer. The v1 design that used to live here is git history of this path. It is not a deployment plan, a fallback, or a coordinator to rebuild.

`github.scope-judge` is retired. Do not revive Hermes, Ruflo, Trigger.dev, WDK, or that gate.

## Current

- JOV work is claimed by Symphony lanes: `scripts/lanes/README.md`.
- Summer's runtime is Eve in `JovieInc/summer-config` `apps/summer`. Health is `https://summer.jov.ie/runtime/v1/health`, not this file.
- Code under `apps/web/lib/agent-os` is the product module. It is not this retired control plane.
- Product memory is a separate stack: `docs/MEMORY_CORE_ARCHITECTURE.md`, `docs/MEMORY_ADR.md`, JOV-2705. Those files are pointers too.

## Do not

Do not treat a search hit on this path as permission to install a gateway, a launchd unit, or a second owner.
