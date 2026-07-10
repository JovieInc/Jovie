# Auth & Onboarding (App Router)

This directory contains the App Router auth pages for Jovie. The primary auth UI is **SSO + email OTP**: Jovie renders first-party Google and Apple buttons plus an email one-time-code form via the shared `AuthShell` (Better Auth). Password auth is intentionally unsupported.

## Runtime Model

- `/signin` renders `AuthShell` (`mode="sign-in"`) inside `AuthLayout`.
- `/signup` renders `AuthShell` (`mode="sign-up"`) inside `AuthLayout`.
- Soft navigations to `/signin` / `/signup` can be intercepted by the root `@auth` modal slot, which wraps the same `AuthShell` in `AuthModalShell` (JOV-2064 / JOV-2089).
- OAuth providers are gated by `getEnabledAuthOAuthProviders()` — Apple is omitted unless production credentials are valid.
- Email OTP (`emailOtp`) is intentional and supported (founder decision 2026-06; JOV-2763 supersedes the SSO-only contract from JOV-2446).
- Password fields must never mount on these surfaces.

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
- [`tests/e2e/synthetic-auth-ui.spec.ts`](../../tests/e2e/synthetic-auth-ui.spec.ts) verifies the production auth surface renders SSO buttons and the intentional email/identifier input.

## Manual QA

- Signed-out auth-page QA can use `/browse` directly against `/signin` and `/signup`.
- Signed-in dashboard or onboarding QA through gstack browse should first import cookies with `/setup-browser-cookies`, then reopen the app in the browse session.
- For staging verification, always check both `/signin` and `/signup` on `staging.jov.ie`; a healthy `/api/health` response is not enough to prove auth is working.
