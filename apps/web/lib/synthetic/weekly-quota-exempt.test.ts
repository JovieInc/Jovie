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
      expect(
        isWeeklyAiQuotaExemptEmail(other as string | null | undefined)
      ).toBe(false);
    }
  });

  it('guards the exemption source against a widened allowlist', () => {
    // The source of truth must stay an exact frozen list of the returning
    // canary only — a widened list silently unmeters real customers.
    const source = readFileSync(
      resolve(__dirname, 'prodcert-identities.ts'),
      'utf8'
    );
    expect(source).toContain(
      'Object.freeze([PRODCERT_RETURNING_CANARY_EMAIL])'
    );
  });
});
