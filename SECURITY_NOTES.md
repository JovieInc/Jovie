# Security Posture Notes

_Last reviewed: 2025-11-29_

## 1. Environment & secrets

- **Source of truth**
  - Runtime env comes from `.env.*` files and Vercel project settings.
  - Config and validation are centralized in `lib/env.ts`, `lib/startup/environment-validator.ts`, `docs/env.md`, and `tests/lib/environment-validation.test.ts`.

- **Validation**
  - `lib/env.ts` uses Zod to validate core envs (Clerk, Stripe, Cloudinary, DB) with a runtime-vs-build distinction.
  - `lib/startup/environment-validator.ts` and `/api/health/*` routes surface missing/invalid envs and DB issues.

- **Client vs server env**
  - Today `lib/env.ts` builds a single `env` object that includes both public (`NEXT_PUBLIC_*`) and server-only values (DB URL, Stripe secret keys, etc.).
  - That module is imported from both server and client code (e.g. `components/providers/Analytics`, `ClerkAppProvider`, `app/my-statsig.tsx`).
  - This pattern is a **potential footgun**: bundlers cannot always prove which `env.*` fields will be accessed, so server-only secrets can end up in client bundles.
  - **Short-term rule:** treat `lib/env.ts` as **server-only**; any new client code should use `process.env.NEXT_PUBLIC_*` directly or a dedicated client-safe wrapper.
  - **Planned fix:** split into `lib/env-server.ts` (server-only, with Stripe/DB/etc.) and `lib/env-public.ts` (only `NEXT_PUBLIC_*` vars) and update imports so no client component ever touches the server env module.

- **Historical env backups**
  - `env-backup/.env.*` and the committed `.env.local` contain real-looking Supabase, Stripe, Clerk, Statsig/PostHog, and DB credentials.
  - These files are in git history; all values in them should be treated as **compromised** and rotated (most already are).
  - **Rule going forward:**
    - Do **not** add new real secrets under `env-backup/`.
    - If examples are needed, commit **redacted sample files** only, and keep real values in Vercel / 1Password / secret manager.

- **URL encryption**
  - Link wrapping currently uses `simpleEncryptUrl` (base64) in `lib/utils/url-encryption.ts` as an obfuscation layer, not strong encryption.
  - `encryptUrl` / `decryptUrl` exist and reference `URL_ENCRYPTION_KEY`, but that key is not configured yet and the strong path is not wired into link creation.
  - **Assumption:** until `URL_ENCRYPTION_KEY` is defined and enforced and the strong path is used, a DB compromise reveals wrapped target URLs.
  - Future hardening: require a 32-byte `URL_ENCRYPTION_KEY` in all non-local envs and fail fast when the default placeholder is used.

## 2. Input handling & validation

- **Validated areas (good)**
  - **Env & startup:** `lib/env.ts` + `environment-validator.ts` + health routes.
  - **Handles/usernames:** `lib/validation/username.ts`, `lib/username/availability.ts`, `/api/handle/check`, `/app/onboarding/actions.ts` enforce length, charset, reserved words, and collisions.
  - **Notifications:** `/api/notifications/subscribe` and `/api/notifications/unsubscribe` use Zod schemas for `artist_id`, `email`, `method`.
  - **File upload:** `/api/images/upload` validates auth, rate limits per user, checks content type against `image/(jpeg|png|webp)`, and enforces a 4MB size limit via Zod.
  - **Links & tracking:**
    - `/api/wrap-link` validates URLs with `isValidUrl`, runs bot detection, and (optionally) rate-limits.
    - `/api/track` validates `handle` format, `linkType` enum, and target URL before inserting click events and incrementing link click counts.
  - **Social links:** `/api/dashboard/social-links` enforces profile ownership and rejects non-http(s) or malformed URLs.
  - **Email sync:** `/api/account/email` uses Zod and verifies against Clerk email addresses.

- **Gaps / footguns**
  - **Profile updates** (`/api/dashboard/profile`):
    - Accepts a free-form `updates` object filtered only by `allowedFields`.
    - No schema for lengths or patterns on `displayName`, `bio`, `creatorType`, `settings`, `theme`, `venmo_handle`, or the various profile URLs.
  - **Tip creation** (`/api/create-tip-intent`):
    - Reads `{ amount, handle }` directly from JSON, multiplies `amount` by 100, and passes both into Stripe metadata without range or format validation.

- **Near-term hardening plan**
  - Add Zod schemas per route instead of ad-hoc checks:
    - **`ProfileUpdateSchema`** in `/api/dashboard/profile`:
      - `username`: optional, validated with `validateUsername` / `normalizeUsername`.
      - `displayName`: optional, trimmed, max length (e.g. 50).
      - `bio`: optional, trimmed, max length (e.g. 280–512 chars).
      - `creatorType`: enum of allowed types (e.g. `artist | band | podcaster | creator`).
      - `avatarUrl` & DSP URLs: optional `z.string().url()` restricted to `http`/`https`.
      - `isPublic`, `marketingOptOut`: booleans.
      - `settings` / `theme`: optional `z.record(z.unknown())` with a soft size/depth limit when we start persisting structured prefs.
      - `venmo_handle`: optional with a simple, documented pattern.
    - **`TipIntentSchema`** in `/api/create-tip-intent`:
      - `amount`: integer with clear min/max bounds (e.g. 1–500 USD), with user-facing error messages.
      - `handle`: string validated with the same username rules as onboarding/handle check.
  - Rule of thumb: any new server action or API route that consumes JSON from the client should start life with a Zod schema.

## 3. Headers & CSP

- **Current protections**
  - `next.config.js`:
    - Disables `X-Powered-By` and enables gzip compression.
    - Defines `securityHeaders` applied to most routes:
      - `X-Frame-Options: DENY`
      - `X-Content-Type-Options: nosniff`
      - `Referrer-Policy: origin-when-cross-origin`
    - Caching strategy:
      - `/api/feature-flags`: `Cache-Control: no-store`.
      - Other `/api/*`: `Cache-Control: public, max-age=300, s-maxage=300`.
      - All other routes (except `.well-known/vercel/flags`): `Cache-Control: public, max-age=0, must-revalidate`.
    - `next/image` is configured with a very strict per-image CSP (`default-src 'self'; script-src 'none'; sandbox;`) via `images.contentSecurityPolicy`. This applies only to the image optimizer, not as a global app CSP.
  - `middleware.ts`:
    - Bot detection for sensitive link APIs, including a 204 anti-cloaking response for `/api/link/*` when appropriate.
    - Geo-based cookie banner hint via the `x-show-cookie-banner` header.
    - For `/go/*`, `/out/*`, and `/api/*`:
      - `X-Robots-Tag: noindex, nofollow, nosnippet, noarchive`.
      - Strong no-cache headers and `Referrer-Policy: no-referrer`.
    - Adds `Server-Timing` and `X-API-Response-Time` for observability.

- **Planned tightening (low-risk)**
  - Add **HSTS** via `next.config.js` headers:
    - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` on non-local environments.
  - Add a conservative **Permissions-Policy**:
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  - Global **CSP** is intentionally **not** enabled yet:
    - The app relies on multiple third-party scripts (Clerk, Statsig, Stripe JS, Vercel analytics, etc.).
    - A strict CSP would require an explicit allowlist and coordination per dependency, so this is deferred to a dedicated hardening task.

## 4. Dependencies & updates

- **Key security-sensitive dependencies**
  - Framework/runtime: Next.js 15.x / React 18.x on Vercel.
  - Auth: `@clerk/nextjs` 6.x.
  - DB: `@neondatabase/serverless` + `drizzle-orm`.
  - Payments: `stripe` (server) + `@stripe/stripe-js` (client).
  - Feature flags/analytics: Statsig clients (`@statsig/react-bindings`, `@statsig/session-replay`, `@statsig/web-analytics`).

- **Lightweight dependency review process**
  - Before each production promotion **or** at least once per month:
    - Run `pnpm outdated @clerk/nextjs stripe @neondatabase/serverless drizzle-orm` and triage patch/minor updates.
    - Run `pnpm audit --prod` (or rely on CI equivalent) and address high/critical vulnerabilities.
  - For major upgrades (Next, Clerk, Stripe, Drizzle/Neon):
    - Open a dedicated issue/PR; treat as a migration with explicit testing and rollout notes.
  - Periodically prune unused packages:
    - Use `pnpm ls` + `pnpm prune` after confirming tests pass and no imports remain for removed packages.

## 5. Known tradeoffs & open items

- **Env module split**
  - Current risk: `lib/env.ts` mixes public and secret envs and is imported by some client-side modules.
  - Target state: `lib/env-server.ts` (server-only) + `lib/env-public.ts` (client-safe), with linting to prevent importing server envs from `use client` modules.

- **Legacy env backups**
  - `env-backup/.env.*` and the committed `.env.local` are treated as historical snapshots; values must be assumed rotated/compromised.
  - Future changes should avoid adding new secrets to this directory; use redacted examples instead.

- **Link encryption**
  - Current link wrapping uses base64 obfuscation (`simpleEncryptUrl`), which does **not** provide real confidentiality if the DB is compromised.
  - Future work: switch wrapped links to AES-GCM with a managed `URL_ENCRYPTION_KEY` (per environment), plus rotation and key management documented.

- **Rate limiting**
  - Several endpoints (`/api/handle/check`, `/api/track`, `/api/wrap-link`) are intentionally light on rate limiting, per YC-style "do things that don’t scale".
  - Rate limiting utilities exist (e.g. avatar upload rate limit, shared bot-detection helpers) and can be extended once traffic or abuse thresholds are hit.

This document is intentionally short and high-level. For any future feature work, new surfaces should:

1. Use Zod (or existing validation helpers) for **all** client-supplied input.
2. Access env via a **server-only** module on the backend and `NEXT_PUBLIC_*` on the client.
3. Reuse existing error-tracking and analytics wrappers instead of talking directly to third-party SDKs.
