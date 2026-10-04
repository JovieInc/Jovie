import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Main retired these unused REST handlers. Settings loads referral evidence
// directly from the authenticated server service; keep that retirement intact.
describe('retired referral API contracts', () => {
  it.each([
    ['GET', 'code'],
    ['POST', 'code'],
    ['GET', 'stats'],
    ['POST', 'apply'],
  ])('keeps %s /api/referrals/%s retired', (_method, route) => {
    expect(
      existsSync(resolve(process.cwd(), `app/api/referrals/${route}/route.ts`))
    ).toBe(false);
  });
});
