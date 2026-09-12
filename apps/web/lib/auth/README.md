# lib/auth

Better Auth session resolution, user state, and route gating for the Jovie web
app. Better Auth owns `ba_*` tables; this directory maps those sessions onto
Jovie's canonical `users` row and state machine.

**Clerk is retired.** Do not import `@clerk/*` or add `CLERK_*` env. Historical
`users.clerk_id` may still be present on old rows; new code uses
`users.better_auth_user_id` and `users.id`.

## Key entry points

- **`better-auth.ts`** — `betterAuth({...})` server instance. Handler lives at
  `app/api/auth/[...all]/route.ts`.
- **`client.ts`** — `createAuthClient` for browser session reads.
- **`cached.ts`** — `getCachedAuth()` and `getOptionalAuth()` are request-scoped
  (`React.cache`) wrappers around `auth.api.getSession`. Use `getOptionalAuth()`
  for routes that may be unauthenticated; both also honor the dev test-auth
  bypass.
- **`require-auth.ts`** — `requireAuth()` returns `userId` or a 401 response.
- **`gate.ts`** — `resolveUserState()` is the single source of truth for full
  user state. Returns `{ state, redirectTo, context }`.
- **`canonical-user-state.ts`** — `resolveCanonicalState()` is the pure state
  machine.
- **`proxy-state.ts`** — Lightweight middleware-friendly snapshot with Redis
  caching for the edge runtime.
- **`dev-test-auth.server.ts`** — mints real Better Auth sessions for
  `creator` / `creator-ready` / `admin` personas.

## State model

```
UNAUTHENTICATED → NEEDS_DB_USER → NEEDS_WAITLIST_SUBMISSION → WAITLIST_PENDING
                                ↓
                        NEEDS_ONBOARDING → ACTIVE
any → BANNED                  (deleted / suspended / banned)
NEEDS_DB_USER → USER_CREATION_FAILED  (after retry exhaustion)
```

Each state has a redirect (`/signin`, `/waitlist`, `/onboarding`, `/app`,
`/unavailable`, `/error/user-creation-failed`) or `null` for ACTIVE.

## Adding an auth-aware feature

1. **Server component / API route** — call `getOptionalAuth()` for a quick
   userId check, or `resolveUserState()` for full state + entitlements.
2. **Middleware / edge** — use `proxy-state.ts:getUserState()`.
3. **Client** — import `useJovieAuth` / `useUserSafe` from
   `@/hooks/useJovieAuth`.
4. **Local QA** — `/api/dev/test-auth/enter?persona=creator&redirect=/app`.

Canonical agent rules: `.claude/rules/auth.md`.
