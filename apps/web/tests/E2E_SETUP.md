# E2E testing setup

Use the checked-in [Playwright config](../playwright.config.ts) and [auth setup](e2e/auth.setup.ts) as the source of truth. Jovie web uses [Better Auth](../lib/auth/README.md).

- **Local browser and synthetic tests:** use the repository's scoped dev test-auth fixture to establish a real test session. The setup project writes Playwright storage state only after setup succeeds. Never opt a production browser run into local bypass.
- **Signed-out checks:** start from an empty browser context. Do not reuse authenticated storage state for sign-in or sign-up rendering.
- **Deployed release evidence:** use the existing [production auth smoke](e2e/smoke-prod-auth.spec.ts) with its approved synthetic identities. A local fixture pass does not certify email OTP or OAuth on a deployed build.

For local setup and commands, follow the [root README](../../../README.md). Run a targeted spec from the web workspace after the repository's local environment is available:

```bash
pnpm exec playwright test tests/e2e/auth.spec.ts
```

If auth setup fails, check the local target, the exact selected Playwright project, test-auth fixture readiness, and whether the cookie-only session resolves to the expected application user. Do not substitute a signed-out result, skip the test, or report a cached browser state as fresh authentication. Hosted and local fixtures are separate; consult the exact workflow before changing either.
