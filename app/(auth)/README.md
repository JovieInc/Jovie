# Auth & Onboarding (App Router)

This directory contains the authentication pages for the App Router experience. Auth is implemented with **Clerk Elements** and **OTP-only (email) authentication**, and flows directly into the unified onboarding experience.

## Auth Model

- **Email-only OTP** (no passwords, no social/OAuth providers in the UI).
- Routes:
  - `GET /signin` – Renders `OtpSignInForm` inside `AuthLayout`.
  - `GET /signup` – Renders `OtpSignUpForm` inside `AuthLayout`.
- Both forms are built with `@clerk/elements` + shadcn primitives from `@jovie/ui`.

## Onboarding Integration

- After sign-up, users are redirected to `/onboarding` (configure this in the Clerk Dashboard).
- `/onboarding` is protected via Clerk middleware and uses the same `AuthLayout` shell so auth and onboarding share a unified container and styling.
- Onboarding steps are streamlined to:
  1. **Name** – capture the Jovie profile display name.
  2. **Handle** – choose and validate the Jovie handle (with availability checks and link preview).
  3. **Done** – confirm the public profile URL and guide users into the dashboard.

## Testing Notes

- E2E tests should authenticate using **Clerk test-mode tokens / programmatic sessions**, not password-based flows.
- Do **not** reintroduce password fields or OAuth buttons when adding or modifying auth-related UI in this directory.
