# Auth & Onboarding (App Router)

This directory contains the App Router auth pages for Jovie. The primary auth UI is SSO-only: Jovie renders first-party Google and Apple buttons, then starts Clerk OAuth through `useSignIn()` / `useSignUp()`.

## Runtime Model

- `/signin` renders `AuthShell` inside the existing `AuthLayout` and starts Clerk sign-in redirects from app-owned provider buttons.
- `/signup` renders `AuthShell` inside the existing `AuthLayout` and starts Clerk sign-up redirects from app-owned provider buttons.
- Auth pages use the bundled Core 3 Clerk UI via `AuthClientProviders`, rather than relying on the CDN-loaded default auth styling path.
- Auth pages use an auth-only Clerk appearance config with the Core 3 `simple` theme baseline, while non-auth Clerk surfaces keep the shared base appearance.
- Host-to-instance mapping is strict:
  - local/dev uses the account A development instance from Doppler `jovie-web/dev`
  - `staging.jov.ie` uses the account B production instance via `CLERK_PUBLISHABLE_KEY_STAGING` + `CLERK_SECRET_KEY_STAGING`
  - `jov.ie` uses the account A production instance via `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
- Staging auth must never fall back to production Clerk keys. If the staging pair is unavailable at runtime, auth pages must render the auth-unavailable state instead of a `500`.
- Clerk traffic stays on the current origin and proxies through `/__clerk`; do not switch auth pages to direct `clerk.*` URLs.
- Both pages use Clerk redirect OAuth and return through `/signin/sso-callback` or `/signup/sso-callback`.
- The app is the rendering source of truth for allowed providers. Clerk Dashboard configuration must stay SSO-only, but credential inputs must not mount even if the dashboard regresses.

## Route Behavior

- `GET /signin`
  - Falls back to [`APP_ROUTES.DASHBOARD`](../../constants/routes.ts) after successful sign-in.
  - Accepts `?email=` for compatibility, but does not render or prefill a credential field.
  - Links returnees who need help to `/support`, preserving safe query params.
- `GET /signup`
  - Falls back to [`APP_ROUTES.WAITLIST`](../../constants/routes.ts) after successful sign-up unless a central return route is supplied.
  - Preserves signup claim and pricing-plan intent data in session storage before the Clerk flow starts.
  - Shows a compatibility banner for `?oauth_error=` and removes only that query param after render.
  - Preserves a valid `redirect_url` when linking onward to `/signin`.
- Missing-key or mock-mode auth environments render an explicit auth-unavailable card instead of trying to mount Clerk UI without `ClerkProvider`.
- On staging hosts, “missing key” means the staging runtime pair is incomplete, even if production Clerk keys are present.
- Legacy `/sso-callback` auth routes remain in place as compatibility shims for stale redirects and old bookmarks.

## Redirects And Onboarding

- `redirect_url` remains supported for protected-route redirects. Clerk handles the post-auth destination on the main auth pages.
- `/onboarding` is still protected via Clerk middleware and shares the same shell styling, but it is not part of the Clerk prebuilt auth UI.

## Testing Notes

- [`tests/e2e/auth.setup.ts`](../../tests/e2e/auth.setup.ts) uses `@clerk/testing/playwright` to create the shared authenticated Playwright session for protected-route specs.
- [`tests/e2e/auth.spec.ts`](../../tests/e2e/auth.spec.ts) intentionally creates a fresh signed-out browser context so `/signin` and `/signup` are tested as public auth pages, not as redirects for an already signed-in user.
- [`tests/e2e/synthetic-auth-ui.spec.ts`](../../tests/e2e/synthetic-auth-ui.spec.ts) verifies the production auth surface renders SSO buttons without credential inputs.

## Manual QA

- Signed-out auth-page QA can use `/browse` directly against `/signin` and `/signup`.
- Signed-in dashboard or onboarding QA through gstack browse should first import cookies with `/setup-browser-cookies`, then reopen the app in the browse session.
- For staging verification, always check both `/signin` and `/signup` on `staging.jov.ie`; a healthy `/api/health` response is not enough to prove auth is working.
