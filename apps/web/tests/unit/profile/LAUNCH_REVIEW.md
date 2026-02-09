# Public Profile Pages - Pre-Launch Review

Issues discovered during comprehensive testing of public profile pages.
Categorized by severity for prioritization.

## P0 - Launch Blockers

### 1. JSON-LD `</script>` injection (XSS)
**File:** `app/[username]/page.tsx:407-415`

`JSON.stringify()` does not escape `</script>` sequences in user-controlled fields
(`bio`, `display_name`, genre names). An artist setting their bio to
`</script><img src=x onerror=alert(1)>` would inject arbitrary HTML.

**Fix:** Escape `<`, `>`, and `&` in the JSON-LD output:
```ts
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
```
Or move JSON-LD into `generateMetadata` where Next.js handles escaping.

### 2. Venmo tip redirect opens unvalidated URLs
**File:** `components/profile/VenmoTipSelector.tsx:29`
**File:** `components/profile/StaticArtistPage.tsx:142-157`

`extractVenmoUsername()` validates the hostname, but its return value is only used
for display. The raw `venmoLink` URL is passed to `globalThis.open()` without host
validation. A social link with `platform === 'venmo'` containing a non-Venmo URL
would redirect users to an arbitrary site in a financial context.

**Fix:** Only render `VenmoTipSelector` when `extractVenmoUsername` returns non-null
(which confirms the host is `venmo.com`).

### 3. `cache()` deduplication broken - double DB fetch per request
**File:** `app/[username]/page.tsx:277-288, 446`

`generateMetadata` passes raw `username` (line 446) while the page component passes
`username.toLowerCase()` (line 329). React `cache()` treats these as different keys,
causing two full database round-trips per page load instead of one.

**Fix:** Normalize `username` to lowercase in `generateMetadata`:
```ts
const { profile } = await getProfileAndLinks(username.toLowerCase());
```

## P1 - High Priority

### 4. View count inflation (no per-handle rate limit)
**File:** `app/api/profile/view/route.ts:60-70`

Rate limiting is per-IP but not per-handle-per-IP. An attacker can inflate any
artist's view count by sending 100 req/min. The in-memory limiter also resets
on serverless cold starts.

**Fix:** Use compound rate limit key `${ip}:${handle}` with Redis-backed limiter.

### 5. JSON-LD `strategy='afterInteractive'` delays structured data for crawlers
**File:** `app/[username]/page.tsx:402-415`

JSON-LD is injected after the page becomes interactive. Many crawlers (Bing,
social preview bots) may not execute JS. Even Googlebot may not wait for it.

**Fix:** Use `strategy='beforeInteractive'` or render inline `<script>` tags
server-side without the `Script` component.

### 6. Rate limiter `getStatus` + fire-and-forget `limit` race condition
**File:** `app/api/profile/view/route.ts:21-41`

Under high concurrency, multiple requests pass `getStatus` before `limit` is called.
This allows significantly more than the configured limit through.

**Fix:** Use `.limit()` as the primary check (await it for the decision).

### 7. No username length/format validation on path parameter
**File:** `app/[username]/page.tsx:308`

Very long strings create oversized Redis/cache keys and waste DB query time.

**Fix:** Add early validation: `if (username.length > 64) notFound();`

## P2 - Medium Priority

### 8. Claim token in URL leakable via Referer header
**File:** `app/[username]/page.tsx:296`

Claim tokens in query params are visible in browser history, server logs, and
`Referer` headers when clicking outbound links.

**Fix:** Add `Referrer-Policy: no-referrer` on pages with claim tokens, or
use POST-based claim flow.

### 9. LatestReleaseCard "Listen" link missing descriptive aria-label
**File:** `components/profile/LatestReleaseCard.tsx:64-70`

Screen readers announce "Listen" without context of which release.

**Fix:** Add `aria-label={`Listen to ${release.title}`}`.

### 10. Profile owner self-views inflate metrics
**File:** `components/profile/ProfileViewTracker.tsx:24-49`

Every visit triggers a view increment, including the profile owner viewing
their own page.

**Fix:** Check Clerk auth client-side and skip tracking for the owner.

### 11. `showTipButton` always resolves to false (logic contradiction)
**File:** `app/[username]/page.tsx:383` + `components/profile/StaticArtistPage.tsx:216`

In `page.tsx`, `showTipButton = mode === 'profile' && hasVenmoLink`.
In `StaticArtistPage`, it's overridden: `showTipButton={isPublicProfileMode ? false : showTipButton}`.
Since `showTipButton` can only be true when `mode === 'profile'`, and that's
exactly when it gets overridden to false, the tip button is never shown.

**Fix:** Clarify intended behavior and remove the contradicting override.

### 12. Invalid dates from Redis silently propagate
**File:** `lib/services/profile/queries.ts:392-418`

`new Date(invalidString)` returns `Invalid Date` rather than throwing, so
corrupted Redis data silently propagates through rendering.

**Fix:** Validate revived dates with `!isNaN(date.getTime())` and invalidate
cache on failure.

### 13. Raw IPs logged to Sentry breadcrumbs (GDPR/CCPA concern)
**File:** `lib/utils/bot-detection.ts:110`

Client IPs are PII in many jurisdictions. Logging them to Sentry without
hashing could create compliance issues.

**Fix:** Hash or truncate IPs before including in Sentry data.

### 14. `profile_completion_pct` is hardcoded to 80
**File:** `app/[username]/page.tsx:169`

```ts
profile_completion_pct: 80, // Calculate based on filled fields
```

This TODO has not been implemented. The completion percentage is always 80%
regardless of how complete the profile actually is.

**Fix:** Implement actual calculation or remove the field from the public
profile type.

### 15. Contact obfuscation is trivially reversible (ROT-3 + base64)
**File:** `lib/contacts/obfuscation.ts`

Contact emails and phones are "protected" with a simple encoding that any
developer can reverse in seconds. All booking/management contacts are
effectively exposed to scrapers.

**Fix:** Consider server-side contact reveal via CAPTCHA-protected API.
