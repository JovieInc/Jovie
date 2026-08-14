# Auth, Routing, and Runtime (Next.js App Router)

This repo uses a **multi-domain** setup and a custom **proxy middleware entrypoint**.

## Source of truth

- Domains: `apps/web/constants/domains.ts`
- Proxy middleware: `apps/web/proxy.ts`
- Proxy guard (prevents `middleware.ts`): `apps/web/scripts/next-proxy-guard.mjs`
- Auth gate (server): `apps/web/lib/auth/gate.ts`
- Native/web PKCE routing state: `apps/web/lib/auth/routing-state.server.ts`
  through Better Auth's Postgres-backed verification adapter
- Proxy auth state (edge-friendly): `apps/web/lib/auth/proxy-state.ts`
- Root providers: `apps/web/app/layout.tsx` and `apps/web/components/providers/ClientProviders.tsx`

## Domains

- `jov.ie`: public profile reads
- `meetjovie.com`: marketing + app/dashboard + auth

Do not hardcode hostnames or callback URLs in multiple places; use the helpers in `constants/domains.ts`.

## Middleware entrypoint

Do not create `middleware.ts`.

This repo routes requests through:

- `apps/web/proxy.ts`

The repo enforces this via `next:proxy-guard`.

## Auth decision layers

There are two intentional layers:

- **Proxy routing layer** (`proxy.ts` + `lib/auth/proxy-state.ts`): fast, minimal checks for redirects.
- **Authoritative app layer** (`lib/auth/gate.ts`): full user state machine and redirects.

Avoid introducing a third place where auth routing decisions are made.

Redis is not an authentication availability dependency. Rate limiting and
secondary-storage caching may degrade during a Redis outage, but PKCE state,
native exchange codes, durable sessions, and one-time tokens remain
Postgres-backed and atomically consumed.

## Runtime selection (Vercel)

- Use `export const runtime = 'edge'` for latency-sensitive public reads.
- Use `export const runtime = 'nodejs'` for Stripe and Node-only libraries.

Never import Node-only dependencies in Edge code.
