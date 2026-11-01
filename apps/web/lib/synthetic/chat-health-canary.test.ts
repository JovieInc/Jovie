import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isChatHealthCanaryEmail,
  isProdcertCanaryEmail,
  isWeeklyQuotaExemptCanaryEmail,
  newProdcertUserEmail,
  PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
  PRODCERT_RETURNING_CANARY_EMAIL,
  QUOTA_EXEMPT_CANARY_EMAILS,
} from './prodcert-identities';

const webRoot = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(webRoot, path), 'utf8');

describe('chat-health canary identity', () => {
  it('is a sanctioned canary on a controlled domain, distinct from the returning canary', () => {
    expect(isProdcertCanaryEmail(PRODCERT_CHAT_HEALTH_CANARY_EMAIL)).toBe(true);
    expect(PRODCERT_CHAT_HEALTH_CANARY_EMAIL).toMatch(/@jov\.ie$/);
    expect(PRODCERT_CHAT_HEALTH_CANARY_EMAIL).not.toBe(
      PRODCERT_RETURNING_CANARY_EMAIL
    );
  });

  it('exempts exactly one email: no other canary, lookalike or empty value', () => {
    expect(isChatHealthCanaryEmail(PRODCERT_CHAT_HEALTH_CANARY_EMAIL)).toBe(
      true
    );
    expect(
      isChatHealthCanaryEmail(
        ` ${PRODCERT_CHAT_HEALTH_CANARY_EMAIL.toUpperCase()} `
      )
    ).toBe(true);
    for (const other of [
      PRODCERT_RETURNING_CANARY_EMAIL,
      newProdcertUserEmail('abcdef123'),
      'browse-ready+chat-health@jov.ie.evil.com',
      'x+browse-ready+chat-health@jov.ie',
      'browse-ready+chat-health@example.com',
      '',
      null,
      undefined,
    ]) {
      expect(isChatHealthCanaryEmail(other)).toBe(false);
    }
  });
});

describe('guards: health checks never spend the returning canary quota', () => {
  it('the chat health spec signs in as the dedicated identity only', () => {
    const spec = read('tests/e2e/synthetic-chat-turn.spec.ts');
    expect(spec).toContain('PRODCERT_CHAT_HEALTH_CANARY_EMAIL');
    expect(spec).not.toContain('PRODCERT_RETURNING_CANARY_EMAIL');
    expect(spec).not.toContain('resolveProductionAuthCredentials');
    expect(spec).not.toContain('clerk_test');
  });

  it('the weekly-quota skip is derived from the session email, never a request header', () => {
    const route = read('app/api/chat/route.ts');
    expect(route).toContain(
      'skipWeeklyQuota: isWeeklyQuotaExemptCanaryEmail(accountContext.email)'
    );
    expect(route.match(/skipWeeklyQuota/g)).toHaveLength(1);
  });
});

describe('guard: synthetic traffic can never consume a certification account quota', () => {
  it('exempts both fixed certification canaries and nothing else', () => {
    expect(QUOTA_EXEMPT_CANARY_EMAILS).toEqual([
      PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
      PRODCERT_RETURNING_CANARY_EMAIL,
    ]);
    expect(
      isWeeklyQuotaExemptCanaryEmail(PRODCERT_RETURNING_CANARY_EMAIL)
    ).toBe(true);
    for (const other of [
      newProdcertUserEmail('abcdef123'),
      'browse-ready+clerk_test@jov.ie.evil.com',
      'someone@example.com',
      '',
      null,
      undefined,
    ]) {
      expect(isWeeklyQuotaExemptCanaryEmail(other)).toBe(false);
    }
  });

  it('every fixed canary a passage token or certification walk can act as is quota exempt', () => {
    const fixed = [
      PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
      PRODCERT_RETURNING_CANARY_EMAIL,
    ];
    for (const email of fixed) {
      expect(isProdcertCanaryEmail(email)).toBe(true);
      expect(isWeeklyQuotaExemptCanaryEmail(email)).toBe(true);
    }
  });

  it('no synthetic spec or script mints a chat passage token for a non-exempt subject', () => {
    const mint = read('../../scripts/synthetic-passage-mint.mjs');
    expect(mint).toContain(
      "DEFAULT_PASSAGE_SUBJECT = 'browse-ready+chat-health@jov.ie'"
    );
    for (const spec of [
      'tests/e2e/synthetic-chat-turn.spec.ts',
      'tests/e2e/smoke-prod-auth.spec.ts',
    ]) {
      const src = read(spec);
      for (const m of src.matchAll(/sub:\s*([A-Za-z_]+)/g)) {
        expect(
          [
            'PRODCERT_CHAT_HEALTH_CANARY_EMAIL',
            'PRODCERT_RETURNING_CANARY_EMAIL',
            // per-run new-user onboarding address: a fresh account each run
            'email',
          ],
          `${spec} mints a passage token for ${m[1]}`
        ).toContain(m[1]);
      }
    }
  });
});
