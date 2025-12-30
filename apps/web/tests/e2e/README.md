# E2E Tests

This directory contains end-to-end tests for the Jovie application using Playwright.

## Running E2E Tests

### Basic Tests

Run all E2E tests:

```bash
pnpm test:e2e
```

Run tests in headed mode (see browser):

```bash
pnpm test:e2e -- --headed
```

Run a specific test file:

```bash
pnpm test:e2e tests/e2e/onboarding.happy.spec.ts
```

### Onboarding Happy Path Tests

The onboarding happy path tests verify the complete user onboarding flow from sign-in to profile creation.

#### Requirements

1. **Environment Variables**: The following real environment variables must be set:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DATABASE_URL` (Neon connection string)

2. **Enable Full Onboarding Tests**: Set `E2E_ONBOARDING_FULL=1`

3. **Optional Configuration**:
   - `E2E_TEST_EMAIL`: Email for test user (defaults to generated email)
   - `E2E_TEST_PASSWORD`: Password for test user (defaults to 'TestPassword123!')
   - `E2E_EXISTING_USER_EMAIL`: Email of existing user to test dashboard access
   - `E2E_EXISTING_USER_PASSWORD`: Password of existing user

#### Running Onboarding Tests

Run the full onboarding happy path test:

```bash
E2E_ONBOARDING_FULL=1 pnpm test:e2e tests/e2e/onboarding.happy.spec.ts
```

Run with custom test user:

```bash
E2E_ONBOARDING_FULL=1 \
E2E_TEST_EMAIL="test@example.com" \
E2E_TEST_PASSWORD="SecurePassword123!" \
pnpm test:e2e tests/e2e/onboarding.happy.spec.ts
```

Run in CI with Preview URL:

```bash
E2E_ONBOARDING_FULL=1 \
BASE_URL="https://jovie-preview.vercel.app" \
pnpm test:e2e tests/e2e/onboarding.happy.spec.ts
```

### Test Structure

- **smoke.onboarding.spec.ts**: Basic smoke tests for onboarding flow
- **onboarding.happy.spec.ts**: Comprehensive happy path test with programmatic sign-in
- **onboarding-flow.spec.ts**: Additional onboarding scenarios and edge cases

### Debugging Tests

1. **Run in debug mode**:

   ```bash
   pnpm test:e2e -- --debug
   ```

2. **Use Playwright Inspector**:

   ```bash
   PWDEBUG=1 pnpm test:e2e tests/e2e/onboarding.happy.spec.ts
   ```

3. **Generate trace on failure**:

   ```bash
   pnpm test:e2e -- --trace on-first-retry
   ```

4. **View test report**:
   ```bash
   pnpm exec playwright show-report
   ```

### Writing New Tests

When writing new E2E tests:

1. **Use deterministic waits**:

   ```typescript
   // Good: Use waitForURL
   await page.waitForURL('**/app/dashboard', { timeout: 10_000 });

   // Good: Use expect.poll
   await expect
     .poll(
       async () => {
         return await button.isEnabled();
       },
       { timeout: 5_000 }
     )
     .toBe(true);

   // Avoid: Fixed timeouts
   await page.waitForTimeout(5000); // Don't do this
   ```

2. **Set appropriate timeouts**:

   ```typescript
   test('my test', async ({ page }) => {
     test.setTimeout(60_000); // 60 seconds for complex flows
   });
   ```

3. **Use proper selectors**:

   ```typescript
   // Good: Semantic selectors
   page.getByLabel('Enter your desired handle');
   page.getByRole('button', { name: 'Create Profile' });

   // Avoid: Brittle selectors
   page.locator('#handle-input');
   page.locator('.submit-btn');
   ```

4. **Handle authentication**:

   ```typescript
   import { setupClerkTestingToken } from '@clerk/testing/playwright';

   // Setup test authentication
   await setupClerkTestingToken({ page });
   ```

### Visual Regression Tests

Visual regression tests capture screenshots of key pages to detect unintended visual changes.

#### Running Visual Tests

```bash
# Run visual regression tests
pnpm test:e2e --grep "Visual Regression"

# Update baseline snapshots after intentional changes
pnpm test:e2e --grep "Visual Regression" --update-snapshots
```

#### Snapshot Storage

- Snapshots are stored in `*.spec.ts-snapshots/` directories next to test files
- **Snapshots must be committed to git** for baseline comparison
- Each browser/platform has separate snapshots (e.g., `chromium-darwin/`, `chromium-linux/`)

#### Test Coverage

Visual tests cover:
- **Public pages**: Homepage, pricing, signin, signup
- **Public profiles**: Light/dark modes, mobile viewport
- **Dashboard**: Home, links, analytics, tipping, settings (requires auth)
- **Admin pages**: Creators, overview, activity (requires admin auth)
- **Responsive viewports**: Mobile (375px), tablet (768px), desktop (1440px)

#### Configuration

- `E2E_TEST_PROFILE_HANDLE`: Handle for public profile tests (default: `demo`)
- Threshold: 5% pixel difference allowed (`maxDiffPixelRatio: 0.05`)
- Dynamic content (timestamps, counters) is masked automatically

#### Updating Snapshots

When making intentional UI changes:

1. Run tests to see failures: `pnpm test:e2e --grep "Visual Regression"`
2. Review the diff in `test-results/` directory
3. Update snapshots: `pnpm test:e2e --grep "Visual Regression" --update-snapshots`
4. Commit the updated snapshots

### CI/CD Integration

E2E tests run automatically in CI:

1. **Pull Request Checks**: Basic smoke tests run on every PR
2. **Preview Deployments**: Full E2E suite runs against Vercel preview URLs
3. **Production Monitoring**: Critical user journeys tested after deployment

### Troubleshooting

**Tests timing out?**

- Increase test timeout: `test.setTimeout(120_000)`
- Check network conditions
- Verify environment variables are set

**Authentication failing?**

- Ensure Clerk test mode is enabled
- Check `CLERK_SECRET_KEY` is valid
- Verify test user credentials

**Flaky tests?**

- Use `expect.poll()` instead of fixed waits
- Add more specific error messages
- Check for race conditions in async operations

**Cannot find elements?**

- Use Playwright Inspector to debug
- Check if elements are within Shadow DOM
- Verify selectors with `page.locator().count()`
