---
name: auth-console-sync
description: |
  Sync the OAuth redirect URIs that Google (Cloud Console) and Apple (Developer
  portal) require for Clerk sign-in to work. Use when production/staging Google
  or Apple sign-in fails with redirect_uri_mismatch / invalid_request, after any
  Clerk instance / FAPI-host change ("staging unification", key rotation, new
  instance), or when scripts/auth-redirect-uris.ts --verify reports drift. These
  consoles have NO CLI/API — this skill drives a logged-in browser.
version: 2026-06-26
scope: JovieInc/Jovie
---

# auth-console-sync

Register the `https://<fapi-host>/v1/oauth_callback` redirect URIs in the Google
OAuth client + Apple Service ID consoles so Clerk Google/Apple sign-in works.

## Why this is browser-only (read first)

There is **no CLI or API** to edit a Google Cloud **Web OAuth 2.0 Client**'s
authorized redirect URIs, nor an Apple **Sign in with Apple Service ID**'s return
URLs. `gcloud` only manages IAP brands; the App Store Connect API key the repo
holds (`APPLE_API_KEY*`) does **not** cover Sign in with Apple config. So this is
the documented "unless you must" exception to the no-GUI rule: drive Tim's
logged-in Chrome via `claude-in-chrome` (NOT headless `/browse` — it can't reach
a 2FA'd console session). The only human step is being signed into both consoles.

## Step 1 — Compute the required URIs (deterministic)

```bash
pnpm tsx scripts/auth-redirect-uris.ts            # prints the full checklist
# decode the live FAPI host to confirm what Clerk actually sends:
doppler run --project jovie-web --config prd -- pnpm tsx scripts/auth-redirect-uris.ts --verify prod
doppler run --project jovie-web --config stg -- pnpm tsx scripts/auth-redirect-uris.ts --verify staging
```

Source of truth: `apps/web/lib/auth/oauth-redirect-uris.expected.json`. The
console redirect_uri Clerk hands a provider is `https://<fapi-host>/v1/oauth_callback`,
where the FAPI host decodes from the instance's publishable key
(`apps/web/lib/auth/decode-fapi-host.ts`). If `--verify` reports drift, update the
snapshot JSON first, then sync the consoles below.

Current registrations (keep in sync with the JSON):
- **Google** client `418036700153-…apps.googleusercontent.com` (project `jovie-338618`) → Authorized redirect URIs must include `https://clerk.jov.ie/v1/oauth_callback` and `https://clerk.staging.jov.ie/v1/oauth_callback`.
- **Apple** Service ID `ie.jov.signin` (team `G24T327LXT`) → Website URLs: domain `clerk.jov.ie`, Return URL `https://clerk.jov.ie/v1/oauth_callback`. (Staging Apple is disabled.)

## Step 2 — Register them via claude-in-chrome (Tim's logged-in browser)

Load `mcp__claude-in-chrome__*` tools (ToolSearch `select:…`). Add missing URIs;
do **not** delete the old ones (harmless; avoids breaking in-flight flows).

**Google** — navigate to the client editor (project + client baked in):
`https://console.cloud.google.com/auth/clients/418036700153-b4cqhpc99ugr5bjgog4pikc16gvv8r2u.apps.googleusercontent.com?project=jovie-338618`
→ scroll to **Authorized redirect URIs** → **+ Add URI** → paste each missing
`https://<fapi>/v1/oauth_callback` → **Save**. Reload the page to confirm it
persisted (the save can bounce the tab to `chrome://newtab`; the value still saved).

**Apple** — navigate to `https://developer.apple.com/account/resources/identifiers/list/serviceId`
→ open **Jovie Sign In** (`ie.jov.signin`) → **Sign In with Apple** row → **Configure**
→ **Website URLs +** → **Domains and Subdomains** = `clerk.jov.ie`, **Return URLs** =
`https://clerk.jov.ie/v1/oauth_callback` → **Next** → **Done** → **Continue** → **Save**.

## Step 3 — Verify (decoupled from Clerk + bot-protection)

Do NOT rely on clicking the in-app "Continue with Google" button — Clerk's
invisible bot-protection gates automated clicks. Instead probe the providers
directly:

```bash
CI=true SMOKE_ONLY=1 BASE_URL=https://jov.ie \
  pnpm --filter @jovie/web exec playwright test tests/e2e/oauth-providers.spec.ts --project=chromium
```

Green = Google + Apple accept Clerk's redirect_uri. Or eyeball it: open
`https://accounts.google.com/o/oauth2/v2/auth?client_id=<clientId>&redirect_uri=https%3A%2F%2Fclerk.jov.ie%2Fv1%2Foauth_callback&response_type=code&scope=openid%20email%20profile`
→ a "Choose an account / to continue to Jovie" screen (not Error 400) = fixed.
Google changes are usually live in seconds; Apple can take a few minutes.

## Guardrails that depend on this skill

- `apps/web/tests/unit/auth/fapi-host-snapshot.test.ts` fails if a FAPI host changes → forces a re-sync here.
- `oauth-providers.spec.ts` runs in the canary (staging) pre-promote and the `production-oauth-gate` post-promote (auto-rolls-back prod on failure).
