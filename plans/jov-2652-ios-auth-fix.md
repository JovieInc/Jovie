---
type: concept
title: Jov 2652 Ios Auth Fix
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T03:15:36.344Z'
source_kind: 'mcp:put_page'
---

# JOV-2652: Fix iOS Auth Configuration with Clerk

**Priority:** P1 (ASAP)
**Worktree:** `fix/jov-2652-ios-auth`
**Labels:** Bug, auth, env, severity:P1, area:infra, testing

---

## 1. Root Cause Analysis

The iOS app's Clerk authentication flow has multiple configuration mismatches that prevent successful sign-in. The issues span the iOS native client, the Clerk dashboard configuration, and environment-specific values.

### 1.1 — Outdated `Configuration.local.plist` references `meetjovie.com`

**File:** `apps/ios/Jovie/Configuration.local.plist`

The local dev config still has `WebBaseUrl = https://meetjovie.com`. The repo has migrated to a single-domain architecture where everything lives on `jov.ie`. If `NEXT_PUBLIC_APP_URL` is not explicitly set in Doppler, the fallback `https://meetjovie.com` is used, sending users to the wrong domain for web handoff flows.

**Impact:** Web handoff ("Continue on Web") sends users to `meetjovie.com` which 301-redirects to `jov.ie`. Works but adds latency and is fragile.

### 1.2 — Clerk Dashboard Redirect URI / Callback URL Scheme mismatch

**File:** `apps/ios/Jovie/App/JovieApp.swift`

The app configures Clerk with:
```swift
redirectConfig: .init(
    redirectUrl: "ie.jov.Jovie://callback",
    callbackUrlScheme: "ie.jov.Jovie"
)
```

**File:** `apps/ios/Jovie/Info.plist`
URL scheme: `ie.jov.Jovie` with callback name `ie.jov.Jovie.callback`.

**File:** `apps/ios/Jovie/Jovie.entitlements`
Associated Domains: `webcredentials:distinct-giraffe-5.clerk.accounts.dev`.

**Likely root cause:** The Clerk dashboard must have redirect URI `ie.jov.Jovie://callback` registered for the native application. If this is not configured, the OAuth redirect after OTP verification will fail with "Invalid redirect_uri" or silently fail to return to the app.

### 1.3 — No `vercel.json` rewrite for Clerk FAPI proxy

**File:** `vercel.json`

The `vercel.json` does NOT contain rewrite rules for `/__clerk/*` paths. The proxy middleware in `proxy.ts` handles Clerk FAPI proxying at the middleware level, but without explicit Vercel rewrites, requests to these paths may not reach the Next.js router in edge deployments.

### 1.4 — iOS entitlements use hardcoded Clerk FAPI host

**File:** `apps/ios/Jovie/Jovie.entitlements`

```xml
<string>webcredentials:distinct-giraffe-5.clerk.accounts.dev</string>
```

The README explicitly calls this out: "If Clerk rotates hosts, update `Jovie.entitlements` before expecting native auth to work." If the Clerk instance was rotated, universal link verification fails silently.

### 1.5 — iOS app has no staging/production key switching

**File:** `apps/ios/Jovie/App/Configuration.swift`

The iOS app always reads the same `CLERK_PUBLISHABLE_KEY`. If pointed at staging web, the Clerk key must match the staging Clerk instance. Currently no mechanism exists to switch keys by environment on the native side.

---

## 2. Files to Modify

| File | Change |
|------|--------|
| `apps/ios/Jovie/Jovie.entitlements` | Verify/update `webcredentials` domain matches current Clerk FAPI host |
| `apps/ios/Jovie/App/JovieApp.swift` | Verify Clerk `redirectConfig` matches Clerk dashboard |
| `apps/ios/scripts/setup-env.sh` | Ensure `WebBaseUrl` uses `jov.ie`; add validation warnings |
| `apps/ios/Jovie/Configuration.local.plist` | Update fallback `WebBaseUrl` to `https://jov.ie` |
| `apps/web/vercel.json` | Add Clerk proxy rewrites for `/__clerk/*` |

---

## 3. Implementation Steps

### Step 1: Verify Clerk Dashboard Configuration (MUST DO FIRST)

1. Log in to `https://dashboard.clerk.com`
2. Navigate to Jovie application (instance: `distinct-giraffe-5`)
3. **Under "Native Applications" → "iOS":**
   - Verify Bundle ID: `ie.jov.Jovie`
   - Verify Redirect URI: `ie.jov.Jovie://callback`
   - **If missing, add it — this is likely the root cause**
4. **Under "Domains" → "Allowed redirect URLs":**
   - Add `ie.jov.Jovie://callback` if not present
   - Add `https://jov.ie/*` for web redirects
   - Add `http://localhost:3100/*` for local dev
   - Add `https://*.vercel.app/*` for PR previews
5. **Verify the Clerk publishable key** matches Doppler `jovie-web/dev`:
   ```bash
   doppler run --project jovie-web --config dev -- bash -lc 'echo $NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
   ```
6. **Verify the FAPI host** — decode the key:
   ```bash
   echo "pk_test_ZGlzdGluY3QtZ2lyYWZmZS01LmNsZXJrLmFjY291bnRzLmRldiQ" | base64 -d
   # Should output: distinct-giraffe-5.clerk.accounts.dev
   ```

### Step 2: Update iOS Entitlements

**File:** `apps/ios/Jovie/Jovie.entitlements`

If the Clerk FAPI host has changed, update:
```xml
<string>webcredentials:{CURRENT_CLERK_FAPI_HOST}</string>
```

### Step 3: Update `Configuration.local.plist`

**File:** `apps/ios/Jovie/Configuration.local.plist`

```xml
<key>WebBaseUrl</key>
<string>https://jov.ie</string>
```

### Step 4: Add Clerk Proxy Rewrites to `vercel.json`

**File:** `vercel.json`

Add to the `rewrites` array:
```json
{
  "source": "/__clerk/(.*)",
  "destination": "/__clerk/$1"
}
```
This forces `/__clerk/*` requests through Next.js routing where `proxy.ts` handles them.

### Step 5: Validate iOS Setup Script

**File:** `apps/ios/scripts/setup-env.sh`

Add validation warnings:
```bash
if [[ "$WEB_BASE_URL" == *"meetjovie.com"* ]]; then
  echo "WARNING: WebBaseUrl references meetjovie.com (deprecated). Expected jov.ie."
fi
```

### Step 6: Verify Auth Flow End-to-End

1. `pnpm run ios:setup-env`
2. Open iOS simulator, attempt sign-in with Clerk test user
3. Verify OTP email received and accepted
4. Verify app redirects back from Clerk web to native app
5. Verify session token obtained via `ClerkTokenProvider`
6. Verify `/api/mobile/v1/me` request succeeds

---

## 4. Code Changes (Exact)

### Change 1: `apps/ios/Jovie/Configuration.local.plist`
```xml
<!-- BEFORE -->
<key>WebBaseUrl</key>
<string>https://meetjovie.com</string>

<!-- AFTER -->
<key>WebBaseUrl</key>
<string>https://jov.ie</string>
```

### Change 2: `apps/web/vercel.json`
```json
// Add to existing "rewrites" array:
{ "source": "/__clerk/(.*)", "destination": "/__clerk/$1" }
```

### Change 3: `apps/ios/Jovie/Jovie.entitlements`
Verify (update only if Clerk FAPI host changed):
```xml
<string>webcredentials:distinct-giraffe-5.clerk.accounts.dev</string>
```

---

## 5. Test Plan

### Unit Tests (Vitest — Web)

| Test | File | What to verify |
|------|------|----------------|
| Clerk key resolution | `staging-clerk-keys.test.ts` | Staging vs production key selection |
| FAPI host decoding | `decode-fapi-host.test.ts` | Key decodes to `distinct-giraffe-5.clerk.accounts.dev` |
| Auth redirect URLs | `gate.test.ts` | URLs use `jov.ie` not `meetjovie.com` |
| Redirect sanitization | `constants.test.ts` | Protocol-relative and backslash bypasses rejected |

### Unit Tests (Xcode — iOS)

| Test | File | What to verify |
|------|------|----------------|
| Configuration parsing | `AppStateTests.swift` | Valid config with non-empty keys |
| Token provider | `MeRepositoryTests.swift` | Throws `missingToken` without session |

### E2E Tests (Playwright — Web)

| Test | File | What to verify |
|------|------|----------------|
| Sign-in flow | `auth/signin.spec.ts` | OTP sign-in works end-to-end |
| Staging auth | `auth/staging-auth.spec.ts` | Staging uses staging Clerk keys |

### Manual E2E (iOS Simulator)

1. Delete app, reset simulator
2. `pnpm run ios:setup-env`
3. Build and run in simulator
4. Sign in with test email + OTP (code: `424242` in test mode)
5. Verify redirect back to native app
6. Verify DashboardView or NeedsOnboardingView appears
7. Check Sentry for auth errors

---

## 6. Verification Steps

- [ ] Clerk dashboard: redirect URI `ie.jov.Jovie://callback` registered
- [ ] Clerk dashboard: `https://jov.ie/*` and `http://localhost:3100/*` in allowed redirect URLs
- [ ] Clerk publishable key FAPI host matches entitlements
- [ ] `Configuration.local.plist` has `WebBaseUrl = https://jov.ie`
- [ ] `vercel.json` includes Clerk proxy rewrite
- [ ] `pnpm run ios:setup-env` succeeds
- [ ] `pnpm run test` passes (web unit tests)
- [ ] `pnpm run ios:test` passes (iOS unit tests)
- [ ] Full OTP sign-in works in iOS simulator
- [ ] `curl -I https://jov.ie/__clerk/v1/client` returns non-404

---

## 7. Risk Assessment

- **Low:** Updating `vercel.json` (self-rewrite is harmless)
- **Low:** Updating `Configuration.local.plist` (local dev fallback only)
- **Medium:** Updating `Jovie.entitlements` (requires matching Clerk FAPI host)
- **High:** Clerk dashboard changes (incorrect redirect URI registration breaks all iOS auth)

**Rollback:** Revert the PR on worktree `fix/jov-2652-ios-auth`. Clerk dashboard changes can be undone by removing the redirect URI entry.

## 8. Dependencies

- Clerk dashboard access (`distinct-giraffe-5` instance)
- Doppler `jovie-web/dev` access
- macOS + Xcode for iOS simulator testing
