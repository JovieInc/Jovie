import type { Page } from '@playwright/test';
import {
  getDeterministicTestBetterAuthUserId,
  getDeterministicTestClerkId,
} from '@/lib/testing/test-user-provision.server';
import {
  setTestAuthBypassSession,
  waitForAuthenticatedHealth,
} from '../../helpers/auth';

export async function ensureServerAuthenticated(
  page: Page,
  clerkUserId: string
): Promise<void> {
  const shouldAttachTestBypass =
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    process.env.E2E_ATTACH_TEST_AUTH_BYPASS_AFTER_SIGNUP === '1';

  if (!shouldAttachTestBypass) {
    return;
  }

  const session = await setTestAuthBypassSession(page, null, clerkUserId);
  // Fresh QA actors are addressed by a legacy DB key but their cookies carry
  // the canonical Better Auth ID. Check the actual cookie, not a test header.
  if (
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
    clerkUserId.startsWith('user_dev_gp_')
  ) {
    const { email, userId } = session;
    if (
      !email ||
      getDeterministicTestClerkId(email) !== clerkUserId ||
      getDeterministicTestBetterAuthUserId(email) !== userId
    ) {
      throw new Error('Better Auth fresh QA fixture identity did not match');
    }
    await waitForAuthenticatedHealth(page, userId, { cookieOnly: true });
    return;
  }
  await waitForAuthenticatedHealth(page, clerkUserId);
}
