# Summer runtime retirement

> Effective: 2026-09-02
> Owner: Summer runtime / Eve integration
> Status: Hermes retired. This file is not a live health record.
> Machine record: [`scripts/summer-commissioning/architecture-freshness-registry.json`](../../scripts/summer-commissioning/architecture-freshness-registry.json)

## Current truth

Hermes and Trigger.dev are retired Jovie tooling. They are not active components, fallbacks, or approved rollback paths.

The September 2026 pages that described those tools are stubs. The old bodies are git history of each path. Do not follow a stub as a procedure, and do not paste the procedure back into the stub.

Summer's runtime process is Eve in `JovieInc/summer-config` `apps/summer`, Vercel project `jovie-eve-shadow`, domain `https://summer.jov.ie`. Whether it is up is `GET /runtime/v1/health` on that domain. This file does not certify health. Do not create another Vercel project named `summer`.

The architecture registry's `refreshBy` is `2026-09-09`. A caller that requires a fresh record fails closed. Do not extend that deadline to make this page look current.

## Local retirement receipt (2026-09-02)

The macOS Summer runtime was retired recoverably:

- Disabled launch labels: `ai.hermes.gateway-summer`, `ai.hermes.summer-auto-update`, and `ai.jovie.summer-idle-kick`.
- Archived profile and durable context: Hermes config snapshot `summer-hermes-20260902T043256Z`.
- The unrelated `co.jovie.hermes.gbrain-worker` service was not stopped. Leaving it running did not keep Hermes as a runtime.
- The Hermes config directory may still hold credentials. That directory is not a runtime to start.
- Restoring a retired launcher is prohibited unless a new architecture decision explicitly recommissions it.

## Supersession

Historical documents are not retained as runbooks. A retirement notice plus the old procedure still ranks as current architecture. The procedure stays in git history.
