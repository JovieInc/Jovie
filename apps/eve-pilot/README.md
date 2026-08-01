# Jovie Eve Pilot

This is the first, deliberately narrow Jovie integration with Vercel Eve.

## What it proves

- Eve can discover Jovie-owned Markdown skills and typed TypeScript tools.
- The pilot returns structured, read-only capability boundaries.
- It carries no user-data access, external-provider credentials, write scope,
  deployment configuration, or public channel.

## What it does not change

- apps/web remains on AI SDK v6 and continues to own synchronous chat.
- Trigger.dev remains the durable customer-workflow runner.
- The pilot is not an authorization path and cannot make database or provider
  changes.

## Local verification

Requires Node 24 or later because Eve 0.27.8 requires it. This requirement is
isolated to this deploy unit; the monorepo root remains on its established Node
22 contract.

    cd apps/eve-pilot
    pnpm install --frozen-lockfile
    pnpm run typecheck
    pnpm run test
    pnpm run build

## Promotion gate

Before connecting this pilot to a real Jovie surface, add a Jovie-owned
authenticated API boundary, scoped identity propagation, audit logs, explicit
approval semantics for writes, and a production security review. Provider OAuth
or Vercel Connect configuration is intentionally out of scope for this pilot.
