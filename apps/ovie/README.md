# Ovie web boundary — JOV-6026

This is an intermediate Next.js source/build boundary. Tim's 2026-09-23
decision puts the final private app and Mac distribution in `JovieInc/ovie`.
Keep Jovie's operator paths until that app has authenticated, installed proof.

Ovie reuses Jovie's screens, handlers, data, chat, tokens and `packages/ui`.
`@jovie/web` is a **source** dependency; Ovie never builds Jovie.
`scripts/routes.mjs` generates re-export adapters for an explicit route list.
`public` and `app/workspace.css` reuse assets and shared utilities. Build
caching stays off until shared-source inputs have a complete cache key. CI
must exercise both apps when shared code changes.

## Local commands

Use pinned Node 22 and pnpm 9.15.4. Build and typecheck sequentially;
both generate route adapters.

```sh
pnpm install --frozen-lockfile
pnpm --filter @jovie/ovie test
pnpm --filter @jovie/ovie typecheck
pnpm --filter @jovie/ovie build
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/ovie dev
```

Dev port: 3105. Tests mock external services. Packaged server:
`apps/ovie/.next/standalone/apps/ovie/server.js`.

## Routes and access

- `/` opens `/hud`; `/app/ov/*` preserves operator deep links and queries.
  `/hud?ovie=mac` remains supported.
- Protected requests, including APIs, RSC and server actions, validate the
  Better Auth session and admin role; operation-specific authorization and
  MFA still apply. Signin/auth routes grant no operator role.
- The noindex app projects no public artist pages, cron, webhooks or consumer
  controller. Jovie's operator door remains.

## Deployment and rollback

Use a dedicated Vercel Next.js project rooted at `apps/ovie`, Node 22,
`vercel.json` and workspace-file access. Build only Ovie. Bind a reviewed
private hostname; never reuse Jovie's project, release lease or alias.
Vercel deployment history supplies promotion and rollback.

Set `OVIE_WEB_ORIGIN` and app/auth URLs to the exact private HTTPS origin.
Wildcards, credentials, paths, queries and fragments are rejected. Use only
needed server credentials; register the exact OAuth callback origin when
required. Sessions use Ovie's same-origin Better Auth endpoints.

Retain candidate deployment ID and SHA. Before promotion, verify signed-out
and non-admin refusal, operator access, control API reads, navigation and
queries while blocking Jovie frontend requests. Roll back only Ovie; move
entry links after that receipt. JOV-6026 tracks activation.

An artist frontend outage must not remove deployed Ovie controls. Shared
database, auth, flags and downstream services remain dependencies; the shell
still reads artist profiles. JOV-6023/24/25 own runtime separation and
JOV-6021 owns conversation correctness.

JOV-4806: cached Better Auth sessions lack legacy MFA `has()` proof, so admin
APIs can return 403. Keep that gate. JOV-4806 owns second-factor repair;
company-controls acceptance remains open.

## Review decision

**Compose** Next.js, Better Auth, Turbo/pnpm and Vercel. Vercel supports
[separate monorepo projects](https://vercel.com/academy/production-monorepos/deploy-all-apps);
Next.js requires [server authorization at operations](https://nextjs.org/docs/app/guides/authentication).
Revisit source package placement if imports block independent proof.
