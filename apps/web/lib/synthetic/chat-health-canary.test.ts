import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isChatHealthCanaryEmail,
  isProdcertCanaryEmail,
  newProdcertUserEmail,
  PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
  PRODCERT_RETURNING_CANARY_EMAIL,
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
      'skipWeeklyQuota: isChatHealthCanaryEmail(accountContext.email)'
    );
    expect(route.match(/skipWeeklyQuota/g)).toHaveLength(1);
  });
});
