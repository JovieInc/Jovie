# Auth & Onboarding (App Router)

This directory contains the App Router auth pages for Jovie. The primary auth UI now uses Clerk's prebuilt components for reliability instead of the older custom multi-step forms.

## Runtime Model

- `/signin` renders Clerk `<SignIn />` inside the existing `AuthLayout`.
- `/signup` renders Clerk `<SignUp />` inside the existing `AuthLayout`.
- Auth pages use the bundled Core 3 Clerk UI via `AuthClientProviders`, rather than relying on the CDN-loaded default auth styling path.
- Auth pages use an auth-only Clerk appearance config with the Core 3 `simple` theme baseline, while non-auth Clerk surfaces keep the shared base appearance.
- Both pages use:
  - `routing="hash"`
  - `oauthFlow="redirect"`
- Clerk Dashboard configuration is the source of truth for enabled auth methods and social providers. The app no longer forces an OTP-only UI.

## Route Behavior

- `GET /signin`
  - Falls back to [`APP_ROUTES.DASHBOARD`](../../constants/routes.ts) after successful sign-in.
  - Accepts `?email=` and prefills Clerk `initialValues.emailAddress` when the value is a valid email.
  - Preserves a valid `redirect_url` when linking onward to `/signup`.
- `GET /signup`
  - Falls back to [`APP_ROUTES.ONBOARDING`](../../constants/routes.ts) after successful sign-up.
  - Preserves signup claim and pricing-plan intent data in session storage before the Clerk flow starts.
  - Shows a compatibility banner for `?oauth_error=` and removes only that query param after render.
  - Preserves a valid `redirect_url` when linking onward to `/signin`.
- Missing-key or mock-mode auth environments render an explicit auth-unavailable card instead of trying to mount Clerk UI without `ClerkProvider`.
- Legacy `/sso-callback` auth routes remain in place as compatibility shims for stale redirects and old bookmarks.

## Redirects And Onboarding

- `redirect_url` remains supported for protected-route redirects. Clerk handles the post-auth destination on the main auth pages.
- `/onboarding` is still protected via Clerk middleware and shares the same shell styling, but it is not part of the Clerk prebuilt auth UI.

## Testing Notes

- [`tests/e2e/auth.setup.ts`](../../tests/e2e/auth.setup.ts) uses `@clerk/testing/playwright` to create the shared authenticated Playwright session for protected-route specs.
- [`tests/e2e/auth.spec.ts`](../../tests/e2e/auth.spec.ts) intentionally creates a fresh signed-out browser context so `/signin` and `/signup` are tested as public auth pages, not as redirects for an already signed-in user.
- [`tests/e2e/smoke-prod-auth.spec.ts`](../../tests/e2e/smoke-prod-auth.spec.ts) exercises the rendered Clerk flow with real credentials and branches on the next step Clerk presents, including password, email-code, or redirect.

## Manual QA

- Signed-out auth-page QA can use `/browse` directly against `/signin` and `/signup`.
- Signed-in dashboard or onboarding QA through gstack browse should first import cookies with `/setup-browser-cookies`, then reopen the app in the browse session.
