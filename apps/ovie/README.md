# Ovie web boundary — JOV-6026

Ovie runs company operations. Jovie runs the artist experience. They share
implementations: the same tables, clipboard helpers, creator lookups, chat,
voice, design tokens, and UI primitives. This app introduces no second copy
of those components or data-access functions.

`public` links to Jovie's existing asset directory. `app/workspace.css` compiles
utilities from the shared components so the independent build retains their
responsive layout; it defines no second design system.

## Application and library ownership

```text
Jovie deployment                    Ovie deployment
apps/web app/config                 apps/ovie app/config
         \                          /
          shared screens, handlers, helpers
          apps/web source + packages/*
                       |
           authenticated data / runtime APIs
```

The first migration composes existing source directly. `@jovie/web` is a
workspace **source dependency**; Ovie's Turbo tasks never run Jovie's build.
`scripts/routes.mjs` emits small re-export adapters for an explicit route set.
It does not copy implementations. Ovie owns its root, metadata, auth gate,
Next configuration, build output, environment and Vercel project. It does not
import Jovie's root layout/config or proxy its requests through Jovie's web
deployment. Build caching is off until shared-source inputs have a proven
complete cache key; this prevents stale shared-library builds.

The shared modules still physically inside `apps/web` can move into named
packages without changing this contract. Do not fork tables, lookup logic or
clipboard behavior to make the apps compile. Existing `packages/ui` remains
the UI primitive owner. Shared-source changes must exercise both apps in CI.

## Local commands

Use the repository's pinned Node 22 and pnpm 9.15.4 at the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @jovie/ovie test
pnpm --filter @jovie/ovie typecheck
pnpm --filter @jovie/ovie build
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/ovie dev
```

Development uses port 3105. Run build/typecheck sequentially because both
materialize route adapters. Unit tests mock external services; builds and
typechecks do not constitute authenticated runtime certification.

## Routes and authorization

- `/` opens `/hud`; `/app/ov/*` preserves the existing operator deep links
  and queries through local rewrites. `/hud?ovie=mac` remains supported.
- Every protected request, including direct APIs, RSC and server actions,
  validates the real Better Auth session and current admin role. Existing
  operation-specific authorization and MFA checks still execute.
- Public signin/auth handlers allow authentication but do not grant an
  operator role. Public pages cannot bypass the server-action gate.
- The private app is noindex. No artist public-profile routes, customer
  homepage, cron jobs, webhooks or consumer deployment controller are copied.
- Existing Jovie and installed native access remain available. The existing
  shared operator navigation is retained; the Jovie switch returns to the
  ordinary artist app.

## Independent deployment and rollback

Create/use a dedicated Vercel project with root `apps/ovie`, framework Next.js,
Node 22, and the checked-in `vercel.json`. Enable access to workspace files
outside the project root. Build only this package. Bind the reviewed private
hostname to that project; do not reuse Jovie's project ID, release lease or
alias. Vercel's native project deployment history supplies independent
promotion and rollback; a second custom deployment controller is unnecessary.

Set `OVIE_WEB_ORIGIN` to the **exact origin** of the private hostname in its
environment. Production/preview require HTTPS. No wildcard, credentials,
path, query or fragment is accepted. Set public app/auth URLs to the Ovie
origin. Configure only the server-side credentials needed by the shared
handlers. Never copy a secret dump from another deployment. Register the
exact OAuth callback origin in the existing provider configuration when
required. Sessions use the current same-origin Better Auth endpoints.

Deploy an immutable candidate and retain its deployment ID and source SHA.
Before promotion, verify signed-out and non-admin refusal, an authenticated
operator session, same-origin control API reads, navigation and query
preservation. Block Jovie frontend requests during this test. Rollback selects
the prior verified Ovie deployment; do not roll back the artist deployment.
Move current entry links only after this succeeds. Initial activation and
the exact project/origin/auth/runtime receipts are tracked by JOV-6026.

## Evidence boundaries

Success means a Jovie-only page/build failure or unavailable Jovie frontend
does not take down the already deployed Ovie controls. The explicit route
projection tests reject artist-only source entrypoints, and CI runs the
Ovie coverage suite and independent build. Verify the packaged output too:
`apps/ovie/.next/standalone/apps/ovie/server.js`.

Shared database, auth-provider, feature-flag and downstream service outages
are separate reliability concerns. The reused shell still reads artist
profile data and the current chat requires an artist profile. Runtime
separation and commissioning remain with JOV-6023/JOV-6024/JOV-6025 and
conversation correctness with JOV-6021; this frontend split does not certify
or replace those deployments.

Authenticated standalone testing found the existing JOV-4806 blocker:
Better Auth's cached session does not supply the legacy MFA `has()` proof,
so entitlement-gated admin APIs return 403 even for an administrator. The
new app must not weaken this check. JOV-4806 owns the real second-factor and
recent-verification repair for both applications. Until that and private-host
commissioning pass, the full company-controls acceptance test remains open.

## Review decision

**Compose** the existing Next.js, Better Auth, Turbo/pnpm and Vercel substrate.
Independent app projects are a supported Vercel monorepo deployment model:
https://vercel.com/academy/production-monorepos/deploy-all-apps.
Server authorization remains required at operations:
https://nextjs.org/docs/app/guides/authentication.
No new framework, agent runtime, table library or clipboard implementation is
needed. Revisit the shared-source package location when either app's imports
require unrelated application code or prevent independent build/runtime proof.
