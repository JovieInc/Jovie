# lib/auth

Clerk-based authentication, user state resolution, and route gating for the Jovie web app. Sits between Clerk's SDK and the rest of the app, normalizing Clerk identity into Jovie's canonical user state machine.

## Key entry points

- **`cached.ts`** — `getCachedAuth()` and `getOptionalAuth()` are request-scoped (`React.cache`) wrappers around Clerk's `auth()`. Use `getOptionalAuth()` for routes that may be unauthenticated; both also honor the dev test-auth bypass.
- **`require-auth.ts`** — `requireAuth()` returns `userId` or a 401 response. The standard guard for API routes.
- **`gate.ts`** — `resolveUserState()` is the single source of truth for full user state: queries Clerk + DB, lazy-creates the DB user, returns `{ state, redirectTo, context }` where `context` carries `isAdmin`, `isPro`, etc.
- **`canonical-user-state.ts`** — `resolveCanonicalState()` is the pure state machine. Maps `(authState, dbUser, profile, waitlist, deletion)` → one of 8 `CanonicalUserState` values.
- **`proxy-state.ts`** — Lightweight middleware-friendly snapshot (`isActive`, `needsOnboarding`, `needsWaitlist`, `isBanned`) with Redis caching for edge runtime.

## State model

```
UNAUTHENTICATED → NEEDS_DB_USER → NEEDS_WAITLIST_SUBMISSION → WAITLIST_PENDING
                                ↓
                        NEEDS_ONBOARDING → ACTIVE
any → BANNED                  (deleted / suspended / banned)
NEEDS_DB_USER → USER_CREATION_FAILED  (after retry exhaustion)
```

Each state has a redirect (`/signin`, `/waitlist`, `/onboarding`, `/app`, `/unavailable`, `/error/user-creation-failed`) or `null` for ACTIVE. Helpers: `canAccessApp(state)`, `canAccessOnboarding(state)`, `getRedirectForState(state)`.

## Clerk proxy

The `/__clerk` proxy lives in middleware (NOT this directory), and uses `fetch()` rather than `NextResponse.rewrite()` to preserve Host headers. The FAPI host is decoded from the publishable key at runtime. `clerk.jov.ie` is dead as a public URL. Canonical write-up: `AGENTS.md` → "Clerk Auth Proxy Architecture" and `docs/AUTH_ROUTING_RUNTIME.md`.

## Adding an auth-aware feature

1. **Server component / API route** — call `getOptionalAuth()` for a quick userId check, or `resolveUserState()` for full state + entitlements.
2. **Middleware / edge** — use `proxy-state.ts:getUserState()`. It is Redis-cached so it's safe to call on every request.
3. **Gate UI** — branch on `result.state` (e.g. `if (state === 'NEEDS_ONBOARDING') redirect(...)`) and on `result.context.isPro` for plan-aware features.

For Clerk webhooks, see `clerk-webhook/`. For the Clerk → DB sync (email, identity), see `clerk-sync.ts`.
