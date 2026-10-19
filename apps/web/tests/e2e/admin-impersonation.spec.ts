import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

const canRun =
  process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.IMPERSONATION_SECRET || process.env.URL_ENCRYPTION_KEY);

interface TestSessionResponse {
  readonly success: boolean;
  readonly userId: string;
}

interface ProfileResponse {
  readonly profile: { readonly username: string };
}

async function setPersona(
  page: import('@playwright/test').Page,
  persona: 'admin' | 'creator-ready'
): Promise<TestSessionResponse> {
  const response = await page.request.post('/api/dev/test-auth/session', {
    data: { persona },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<TestSessionResponse>;
}

async function getAppUserId(betterAuthUserId: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL ?? '');
  const rows = await sql`
    SELECT id
    FROM users
    WHERE better_auth_user_id = ${betterAuthUserId}
    LIMIT 1
  `;
  const userId = rows[0]?.id;
  if (typeof userId !== 'string') {
    throw new Error('Better Auth bypass user is missing its app user row');
  }
  return userId;
}

test.describe('admin impersonation with Better Auth bypass', () => {
  test.skip(
    !canRun,
    'Requires Better Auth bypass, DATABASE_URL, and an impersonation secret'
  );
  test.use({ storageState: { cookies: [], origins: [] } });

  test('starts, isolates target data, renders the banner, and restores admin state', async ({
    page,
  }) => {
    const targetSession = await setPersona(page, 'creator-ready');
    const targetUserId = await getAppUserId(targetSession.userId);

    const unauthorizedStart = await page.request.post(
      '/api/admin/impersonate',
      { data: { targetUserId } }
    );
    expect(unauthorizedStart.status()).toBe(403);

    await setPersona(page, 'admin');
    const adminProfileBefore = await page.request.get('/api/dashboard/profile');
    expect(adminProfileBefore.ok()).toBeTruthy();
    expect(
      ((await adminProfileBefore.json()) as ProfileResponse).profile.username
    ).toBe('browse-admin-user');

    const start = await page.request.post('/api/admin/impersonate', {
      data: { targetUserId },
    });
    expect(start.ok()).toBeTruthy();
    await page.goto('/app');

    await expect(page).toHaveURL(/\/app(?:\/|$)/);
    await expect(page.getByTestId('impersonation-banner')).toBeVisible();
    await expect(
      page.getByText(targetUserId.slice(0, 16), { exact: false })
    ).toBeVisible();

    const targetProfile = await page.request.get('/api/dashboard/profile');
    expect(targetProfile.ok()).toBeTruthy();
    expect(
      ((await targetProfile.json()) as ProfileResponse).profile.username
    ).toBe('browse-ready-user');

    await page.getByRole('button', { name: 'End Session' }).click();
    await expect(page).toHaveURL('/app/ov');

    const adminProfileAfter = await page.request.get('/api/dashboard/profile');
    expect(adminProfileAfter.ok()).toBeTruthy();
    expect(
      ((await adminProfileAfter.json()) as ProfileResponse).profile.username
    ).toBe('browse-admin-user');

    const status = await page.request.get('/api/admin/impersonate');
    expect(status.ok()).toBeTruthy();
    expect(await status.json()).toMatchObject({
      enabled: true,
      isImpersonating: false,
    });
  });
});
