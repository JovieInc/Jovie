/**
 * Check if Clerk credentials are available for authenticated tests
 *
 * This checks for:
 * 1. E2E_CLERK_USER_USERNAME environment variable
 * 2. E2E_CLERK_USER_PASSWORD environment variable (or +clerk_test email)
 * 3. CLERK_TESTING_SETUP_SUCCESS flag from global setup
 */
export function hasClerkCredentials(): boolean {
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = username.includes('+clerk_test');

  return (
    username.length > 0 &&
    (password.length > 0 || isClerkTestEmail) &&
    clerkSetupSuccess
  );
}
