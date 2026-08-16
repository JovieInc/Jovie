# Jovie Eve Pilot

This is the first, deliberately narrow Jovie integration with Vercel Eve.

## What it proves

- Eve can discover Jovie-owned Markdown skills and typed TypeScript tools.
- The pilot returns structured, read-only capability boundaries.
- It carries no user-data access, external-provider credentials, write scope,
  deployment configuration, or public channel.
- When Jovie's `EVE_CORE_CHAT_MODE=shadow` bridge is explicitly configured, the
  pilot can receive a bounded core-chat observation through Eve's authenticated
  session API. Jovie's existing `streamText` path remains authoritative.

## What it does not change

- apps/web remains on AI SDK v6 and continues to own synchronous chat.
- Trigger.dev remains the durable customer-workflow runner.
- The pilot is not an authorization path and cannot make database or provider
  changes.

## Local verification

Requires Node 24 or later because Eve 0.27.8 requires it. This requirement is
isolated to this deploy unit; the monorepo root remains on its established Node
22 contract.

Install the isolated package from the repository root:

    pnpm --dir apps/eve-pilot install --frozen-lockfile --ignore-workspace

Run the deterministic, credential-free Eve discovery smoke:

    pnpm --dir apps/eve-pilot --ignore-workspace run smoke

For the complete local verification set:

    pnpm --dir apps/eve-pilot --ignore-workspace run typecheck
    pnpm --dir apps/eve-pilot --ignore-workspace run test
    pnpm --dir apps/eve-pilot --ignore-workspace run build

## Core-chat bridge guardrails

The bridge sends the latest user text (bounded to 4,000 characters) plus
read-only routing metadata. It does not send the Jovie system prompt, user id,
provider credentials, or tool implementations. Eve route auth remains required
outside loopback development: the pilot's channel accepts the shared
`EVE_CORE_CHAT_AUTH_TOKEN` bearer or its configured Vercel OIDC caller. Use
HTTPS for non-loopback endpoints. Any transport or protocol failure is a
fail-closed fallback to Jovie's existing chat stream.

## Promotion gate

Before enabling the bridge outside a controlled development or preview
environment, add a Jovie-owned authenticated API boundary, scoped identity
propagation, audit logs, explicit approval semantics for writes, and a
production security review. Provider OAuth or Vercel Connect configuration is
intentionally out of scope for this pilot.
