# E2E Tests

This directory contains end-to-end tests for the Jovie application using Playwright.

## Running E2E Tests

### Basic Tests

Run all E2E tests:

```bash
npm run test:e2e
```

Run tests in headed mode (see browser):

```bash
npm run test:e2e -- --headed
```

Run a specific test file:

```bash
npm run test:e2e tests/e2e/onboarding.happy.spec.ts
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
E2E_ONBOARDING_FULL=1 npm run test:e2e tests/e2e/onboarding.happy.spec.ts
```

Run with custom test user:

```bash
E2E_ONBOARDING_FULL=1 \
E2E_TEST_EMAIL="test@example.com" \
E2E_TEST_PASSWORD="SecurePassword123!" \
npm run test:e2e tests/e2e/onboarding.happy.spec.ts
```

Run in CI with Preview URL:

```bash
E2E_ONBOARDING_FULL=1 \
BASE_URL="https://jovie-preview.vercel.app" \
npm run test:e2e tests/e2e/onboarding.happy.spec.ts
```

### Test Structure

- **smoke.onboarding.spec.ts**: Basic smoke tests for onboarding flow
- **onboarding.happy.spec.ts**: Comprehensive happy path test with programmatic sign-in
- **onboarding-flow.spec.ts**: Additional onboarding scenarios and edge cases

### Debugging Tests

1. **Run in debug mode**:

   ```bash
   npm run test:e2e -- --debug
   ```

2. **Use Playwright Inspector**:

   ```bash
   PWDEBUG=1 npm run test:e2e tests/e2e/onboarding.happy.spec.ts
   ```

3. **Generate trace on failure**:

   ```bash
   npm run test:e2e -- --trace on-first-retry
   ```

4. **View test report**:
   ```bash
   npx playwright show-report
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
