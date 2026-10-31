import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isWeeklyAiQuotaExemptEmail,
  newProdcertUserEmail,
  PRODCERT_ADMIN_READBACK_EMAIL,
  PRODCERT_RETURNING_CANARY_EMAIL,
  WEEKLY_AI_QUOTA_EXEMPT_CANARY_EMAILS,
} from './prodcert-identities';

describe('weekly AI quota exemption', () => {
  it('exempts exactly the release-gate canary addresses', () => {
    expect(WEEKLY_AI_QUOTA_EXEMPT_CANARY_EMAILS).toEqual([
      PRODCERT_RETURNING_CANARY_EMAIL,
    ]);
    expect(isWeeklyAiQuotaExemptEmail(PRODCERT_RETURNING_CANARY_EMAIL)).toBe(
      true
    );
    expect(
      isWeeklyAiQuotaExemptEmail(
        ` ${PRODCERT_RETURNING_CANARY_EMAIL.toUpperCase()} `
      )
    ).toBe(true);
  });

  it('never exempts a non-canary address, lookalike or per-run user', () => {
    for (const other of [
      'artist@gmail.com',
      'someone@jov.ie',
      PRODCERT_ADMIN_READBACK_EMAIL,
      newProdcertUserEmail('abcdef123'),
      `x${PRODCERT_RETURNING_CANARY_EMAIL}`,
      `${PRODCERT_RETURNING_CANARY_EMAIL}.evil.com`,
      '',
      null,
      undefined,
    ]) {
      expect(isWeeklyAiQuotaExemptEmail(other)).toBe(false);
    }
  });

  it('the route derives the skip from the session email, never a request header', () => {
    const route = readFileSync(
      resolve(__dirname, '../../app/api/chat/route.ts'),
      'utf8'
    );
    expect(route).toContain(
      'skipWeeklyQuota: isWeeklyAiQuotaExemptEmail(accountContext.email)'
    );
    expect(route.match(/skipWeeklyQuota/g)).toHaveLength(1);
  });
});
