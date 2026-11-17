// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbCalls = vi.hoisted(() => ({ selects: 0 }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => {
  // No invitation and no approved app user: only an admission rule can admit.
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => [],
  };
  return {
    db: {
      select: () => {
        dbCalls.selects += 1;
        return chain;
      },
    },
  };
});

import { FOUNDER_EMAIL_DOMAIN } from '@/lib/utils/email';
import { assertNewAccountAdmission } from './signup-admission';

const founder = (local: string) => `${local}@${FOUNDER_EMAIL_DOMAIN}`;

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  dbCalls.selects = 0;
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => info.mockRestore());

describe('assertNewAccountAdmission: founder dogfood accounts', () => {
  it.each([
    ['t+dogfood', 'long-lived'],
    ['t+dogfood-studio', 'long-lived'],
    ['t+dogfood-tmp-run42', 'ephemeral'],
  ])('admits a verified %s without an invitation', async (local, lifetime) => {
    await expect(
      assertNewAccountAdmission({ email: founder(local), emailVerified: true })
    ).resolves.toBeUndefined();
    expect(dbCalls.selects).toBe(0);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain('[auth] dogfood account admitted');
    expect(line).toContain(`"lifetime":"${lifetime}"`);
    expect(line).toContain(`"emailDomain":"${FOUNDER_EMAIL_DOMAIN}"`);
    expect(line).toContain('"reason":"founder_dogfood_mailbox"');
    // Domain only: the local part never reaches the log.
    expect(line).not.toContain(local);
  });

  it('still denies an unverified dogfood address before any lookup', async () => {
    await expect(
      assertNewAccountAdmission({
        email: founder('t+dogfood'),
        emailVerified: false,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      body: { code: 'SIGNUP_INVITE_REQUIRED' },
    });
    expect(info).not.toHaveBeenCalled();
  });

  it.each([
    founder('t'),
    founder('tim+dogfood'),
    founder('t+dogfood+x'),
    founder('t+dogfood-tmp'),
    `t+dogfood@sub.${FOUNDER_EMAIL_DOMAIN}`,
    `t+dogfood@${FOUNDER_EMAIL_DOMAIN}.evil.com`,
    't+dogfood@jov.ie',
    't+dogfood@gmail.com',
  ])('denies the look-alike %s without an invitation', async email => {
    await expect(
      assertNewAccountAdmission({ email, emailVerified: true })
    ).rejects.toMatchObject({
      statusCode: 403,
      body: { code: 'SIGNUP_INVITE_REQUIRED' },
    });
    expect(dbCalls.selects).toBe(2);
    expect(info).not.toHaveBeenCalled();
  });
});
