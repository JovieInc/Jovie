// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// No invitation and no adoptable app user: every lookup comes back empty.
vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => [],
  };
  return { db: { select: () => chain } };
});

import { assertNewAccountAdmission } from './signup-admission';

function denialLines(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((line: string) => line.startsWith('[auth] new account denied'));
}

describe('new-account admission denial logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('logs a denial with its reason and the email domain only when closed', async () => {
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      assertNewAccountAdmission({
        email: 'Public+Alias@Example.com',
        emailVerified: true,
      })
    ).rejects.toMatchObject({ body: { code: 'SIGNUP_INVITE_REQUIRED' } });

    const [line] = denialLines(warn);
    expect(line).toContain('"reason":"no_active_invitation"');
    expect(line).toContain('"emailDomain":"example.com"');
    expect(line).not.toMatch(/public|alias/i);
  });

  it('logs an unverified-email denial', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      assertNewAccountAdmission({
        email: 'someone@example.com',
        emailVerified: false,
      })
    ).rejects.toMatchObject({ body: { code: 'SIGNUP_INVITE_REQUIRED' } });

    expect(denialLines(warn)[0]).toContain('"reason":"email_unverified"');
  });
});
