---
name: auth-console-sync
description: |
  Sync the OAuth redirect URIs that Google (Cloud Console) and Apple (Developer
  portal) require for Better Auth sign-in. Use when production/staging Google or
  Apple sign-in fails with redirect_uri_mismatch / invalid_request, or after an
  app host changes. These consoles have NO CLI/API; this skill drives a logged-in browser.
version: 2026-10-29
scope: JovieInc/Jovie
---

# auth-console-sync

Register `https://<appHost>/api/auth/callback/<provider>` in the Google OAuth
client and the Apple Service ID so Better Auth Google/Apple sign-in works. Better
Auth owns the callback at `apps/web/app/api/auth/[...all]/route.ts`; there is no
Clerk FAPI host in the path any more.

## Why this is browser-only (read first)

There is **no CLI or API** to edit a Google Cloud **Web OAuth 2.0 Client**'s
authorized redirect URIs, nor an Apple **Sign in with Apple Service ID**'s return
URLs. `gcloud` only manages IAP brands; the App Store Connect API key the repo
holds (`APPLE_API_KEY*`) does **not** cover Sign in with Apple config. So this is
the documented "unless you must" exception to the no-GUI rule: drive Tim's
logged-in Chrome via `claude-in-chrome` (NOT headless `/browse`: it can't reach
a 2FA'd console session). The only human step is being signed into both consoles.

## Step 1: Compute the required URIs (deterministic)

```bash
pnpm tsx scripts/auth-redirect-uris.ts              # prints the full checklist
pnpm tsx scripts/auth-redirect-uris.ts --self-test  # asserts the snapshot is consistent
```

Source of truth: `apps/web/lib/auth/oauth-redirect-uris.expected.json`. Read the
required redirect URIs, JS origins, Apple domains and return URLs from it; do not
copy them here. When an app host changes, update that JSON first, then sync the
consoles below.

## Step 2: Register them via claude-in-chrome (Tim's logged-in browser)

Load `mcp__claude-in-chrome__*` tools (ToolSearch `select:…`). Add missing URIs;
do **not** delete old ones in the same pass (harmless; avoids breaking in-flight flows).

**Google**: open the `google.consoleUrl` from the JSON → **Authorized JavaScript
origins** and **Authorized redirect URIs** → **+ Add URI** for each missing
`requiredJsOrigins` / `requiredRedirectUris` entry → **Save**. Reload to confirm
it persisted (the save can bounce the tab to `chrome://newtab`; the value still saved).

**Apple**: open the `apple.consoleUrl` → **Jovie Sign In** (`apple.serviceId`) →
**Sign In with Apple** → **Configure** → **Website URLs +** → add each missing
`requiredDomains` entry and `requiredReturnUrls` entry → **Next** → **Done** →
**Continue** → **Save**.

## Step 3: Verify

Probe the providers directly rather than clicking the in-app button:

```bash
CI=true SMOKE_ONLY=1 BASE_URL=https://jov.ie \
  pnpm --filter @jovie/web exec playwright test tests/e2e/oauth-providers.spec.ts --project=chromium
```

Green = Google and Apple accept the Better Auth redirect_uri. Or open
`https://accounts.google.com/o/oauth2/v2/auth?client_id=<clientId>&redirect_uri=https%3A%2F%2Fjov.ie%2Fapi%2Fauth%2Fcallback%2Fgoogle&response_type=code&scope=openid%20email%20profile`
→ a "Choose an account / to continue to Jovie" screen (not Error 400) = fixed.
Google changes are usually live in seconds; Apple can take a few minutes.

## Guardrails that depend on this skill

- `apps/web/tests/unit/auth/redirect-uri-snapshot.test.ts` fails if the snapshot
  drifts from the app hosts, which forces a re-sync here.
- `oauth-providers.spec.ts` runs in the canary (staging) pre-promote and the
  `production-oauth-gate` post-promote (auto-rolls-back prod on failure).
