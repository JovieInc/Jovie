# NEXT_PUBLIC OAuth Flags — Investigation (JOV-2131)

## Decision

**Canonical pattern for OAuth provider enablement:** hardcoded allowlist in
`apps/web/lib/auth/oauth-providers.ts` (`isOAuthProviderEnabled`).

Do **not** gate auth-provider buttons on
`NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED` (or any other env flag).

## What happened (2026-05-10)

| PR | Change | Production result |
|----|--------|-------------------|
| #8458 | Fail-closed gate via `process.env[dynamicKey]` | All OAuth buttons hidden (bracket access never inlines) |
| #8497 | Static `process.env.NEXT_PUBLIC_CLERK_OAUTH_*_ENABLED === '1'` switch | Still all buttons hidden after deploy of `fd17329` |
| #8499 | Hardcoded apple + google allowlist | Fixed |

Fiber inspection of `<SignIn>` `appearance.elements` under #8497 still showed
all 12 `socialButtonsBlockButton__*` / icon variants as `hidden`, including
apple and google — so `isOAuthProviderEnabled` returned `false` for every
provider in the live client bundle.

## What is *not* broken

Local investigation on the current monorepo (Turbo 2.x, Next 16, Vercel build
command `pnpm turbo build --filter=@jovie/web`):

1. **Turborepo cache keys include `NEXT_PUBLIC_*`.** `turbo.json` lists
   `NEXT_PUBLIC_*` under `build.env`. Dry-run hashes differ when
   `NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED=1` is added (`envMode: strict`).
   A remote-cache hit from a build without those flags cannot be reused by a
   build that has them.

2. **Next.js collects public env at build start.**
   `next/dist/lib/static-env.js` → `getNextPublicEnvironmentVariables()` walks
   `process.env` for keys starting with `NEXT_PUBLIC_` and feeds them into
   DefinePlugin / Turbopack define + the post-build `inlineStaticEnv` pass.

3. **Other `NEXT_PUBLIC_*` usages remain valid** when they use static property
   access (e.g. `process.env.NEXT_PUBLIC_APP_URL`, `publicEnv` getters in
   `lib/env-public.ts`). Feature flags, publishable keys, and CSP-related
   public config still rely on this path.

So JOV-2131 is **not** "NEXT_PUBLIC inlining is globally broken under Turbo +
Vercel." It is "env-var kill-switches for auth-provider UI are the wrong
control plane and already burned us in production."

## Likely cause of the #8497 miss (best effort)

Definitive Vercel build logs for `fd17329` were not available in this session.
Given turbo hashing and Next collection both work when the var is present in
the build process environment, the remaining explanations for "dashboard shows
the var, client still sees false" are operational, not framework:

- Build process that produced the client chunk did not actually see the vars
  (wrong project/environment, value not exactly the string `1`, timing).
- Browser console checks of `process.env.NEXT_PUBLIC_*` are **not** proof of
  inlining — DefinePlugin rewrites source AST at compile time; the browser
  console evaluates a different `process.env` object that is usually empty.
- Fiber inspection of `appearance.elements` *is* valid proof the function
  returned false for every provider.

Even if a future preview prove that a throwaway `NEXT_PUBLIC_DEBUG_FLAG=hello`
inlines correctly (expected), we still keep the allowlist for OAuth enablement.

## Rules for agents

| Surface | Pattern |
|---------|---------|
| OAuth provider buttons on sign-in/sign-up | Hardcoded allowlist in `oauth-providers.ts` only |
| Public config (URL, publishable keys, non-auth feature flags) | Static `process.env.NEXT_PUBLIC_*` or `publicEnv` getters |
| Dynamic `process.env[key]` for any `NEXT_PUBLIC_*` | **Forbidden** in client-reachable code — never inlines |

## Guardrails

- Unit tests in `apps/web/tests/unit/lib/auth/oauth-providers.test.ts` assert
  the allowlist and that the source file does not reintroduce
  `process.env.NEXT_PUBLIC_CLERK_OAUTH_*` reads.
- Unit tests in `apps/web/tests/unit/lib/auth/next-public-static-env.test.ts`
  assert Next's static-env collector still picks up throwaway
  `NEXT_PUBLIC_*` keys when set (regression for the global inlining path).

## Related

- JOV-2062 — empty auth UI / Apple invalid client prevention
- JOV-2131 — this investigation
- PRs #8458, #8497, #8499
- `turbo.json` → `tasks.build.env`
- `apps/web/package.json` → `build` (`next build --turbopack`)
- Root `vercel.json` → `buildCommand` (turbo filtered web build)
