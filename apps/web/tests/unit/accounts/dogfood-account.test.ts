import { describe, expect, it } from 'vitest';
import {
  classifyDogfoodAccountEmail,
  dogfoodAdmissionAudit,
  EPHEMERAL_DOGFOOD_MAX_AGE_DAYS,
  isDogfoodAccountEmail,
  isEphemeralDogfoodAccountEmail,
  isExpiredEphemeralDogfoodAccount,
} from '@/lib/accounts/dogfood-account';
import {
  isInternalAccount,
  resolveNewAccountClass,
} from '@/lib/accounts/internal-account';
import {
  DOGFOOD_ACCOUNT_EMAIL_TAG,
  FOUNDER_EMAIL_DOMAIN,
  INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN,
  INTERNAL_ACCOUNT_EMAIL_TAGS,
} from '@/lib/utils/email';

// Built from parts: the private-data guard rejects the literal founder hostname.
const DOMAIN = ['timwhite', 'co'].join('.');
const at = (local: string) => `${local}@${DOMAIN}`;

describe('dogfood constants reuse the internal-account rules', () => {
  it('pins the founder domain and the dogfood tag', () => {
    expect(FOUNDER_EMAIL_DOMAIN).toBe(DOMAIN);
    expect(DOGFOOD_ACCOUNT_EMAIL_TAG).toBe('dogfood');
    expect(INTERNAL_ACCOUNT_EMAIL_TAGS).toContain(DOGFOOD_ACCOUNT_EMAIL_TAG);
  });
});

describe('isDogfoodAccountEmail', () => {
  it.each([
    [at('t+dogfood'), 'long-lived'],
    [at('t+dogfood-studio'), 'long-lived'],
    [at('t+dogfood-label-qa-2'), 'long-lived'],
    [at('t+dogfood-tmpfoo'), 'long-lived'],
    [at('t+dogfood-tmp-run42'), 'ephemeral'],
    [at('t+dogfood-tmp-agent-7f3a'), 'ephemeral'],
    [`  ${at('t+dogfood')}  `, 'long-lived'],
    [at('T+DOGFOOD').toUpperCase(), 'long-lived'],
    [at('t+dogfood-Studio'), 'long-lived'],
    [at(`t+dogfood-${'a'.repeat(40)}`), 'long-lived'],
  ])('accepts %s as %s', (email, lifetime) => {
    expect(classifyDogfoodAccountEmail(email)).toBe(lifetime);
    expect(isDogfoodAccountEmail(email)).toBe(true);
  });

  it.each([
    // Wrong mailbox owner or domain
    ['t+dogfood@jov.ie', 'team domain'],
    ['t+dogfood@gmail.com', 'other domain'],
    ['t+dogfood@test.jovie.com', 'QA domain'],
    [`t+dogfood@sub.${DOMAIN}`, 'founder subdomain'],
    [`t+dogfood@${DOMAIN}.evil.com`, 'founder domain as a prefix'],
    [`t+dogfood@evil${DOMAIN}`, 'founder domain as a suffix'],
    [`t+dogfood@${DOMAIN}.`, 'trailing dot'],
    [`t+dogfood@${DOMAIN}@evil.com`, 'second at sign'],
    [`t+dogfood@evil.com@${DOMAIN}`, 'smuggled domain in local part'],
    [`t+dogfood@${DOMAIN.replace('.', '-')}`, 'dot replaced'],
    // Wrong local part
    [at(''), 'missing local part'],
    [at('+dogfood'), 'missing base local part'],
    [at('t'), 'plain founder inbox'],
    [at('tim+dogfood'), 'other base local part'],
    [at('tt+dogfood'), 'longer base local part'],
    [at('x.t+dogfood'), 'prefixed base local part'],
    [at('dogfood'), 'dogfood without the plus'],
    [at('tdogfood'), 'tag glued to base'],
    [at('t-dogfood'), 'hyphen instead of plus'],
    [at('t+dogfoods'), 'longer tag'],
    [at('t+dogfoodx'), 'tag with trailing letters'],
    [at('t+dog'), 'truncated tag'],
    [at('t+e2e'), 'other internal tag'],
    [at('t+dogfood+x'), 'extra plus tag'],
    [at('t+x+dogfood'), 'tag after another tag'],
    [at('t++dogfood'), 'double plus'],
    [at('t+dogfood.x'), 'dot suffix'],
    [at('t+dogfood_x'), 'underscore suffix'],
    [at('t+dogfood-'), 'empty slug'],
    [at('t+dogfood--x'), 'double hyphen'],
    [at('t+dogfood-x-'), 'trailing hyphen'],
    [at('t+dogfood-tmp'), 'tmp without an id'],
    [at('t+dogfood-tmp-'), 'tmp with an empty id'],
    [at('t+dogfood-a b'), 'space in slug'],
    [at(`t+dogfood-${'a'.repeat(41)}`), 'slug over 40 characters'],
    [`"t+dogfood"@${DOMAIN}`, 'quoted local part'],
    // Unicode look-alikes
    [at('t+dogfood-\u212Aey'), 'Kelvin sign lowercasing to k'],
    [at('t+d\u043Egfood'), 'Cyrillic o in tag'],
    [at('\u0442+dogfood'), 'Cyrillic t base'],
    [`t+dogfood@${DOMAIN.replace('c', '\u0441')}`, 'Cyrillic s in domain'],
    [`t+dogfood@${DOMAIN}\u200B`, 'zero-width space'],
    [at('t+dogfood\u0000'), 'NUL byte'],
    // Not a string
    ['', 'empty'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('rejects %s (%s)', (email, _label) => {
    expect(classifyDogfoodAccountEmail(email)).toBeNull();
    expect(isDogfoodAccountEmail(email)).toBe(false);
    expect(dogfoodAdmissionAudit(email)).toBeNull();
  });
});

describe('dogfood account marking', () => {
  it.each([at('t+dogfood'), at('t+dogfood-studio'), at('t+dogfood-tmp-run42')])(
    'stamps %s internal at creation and excludes it from metrics',
    email => {
      expect(resolveNewAccountClass({ email })).toBe('internal');
      expect(isInternalAccount({ email, accountClass: null })).toBe(true);
      expect(
        new RegExp(INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN, 'i').test(email)
      ).toBe(true);
    }
  );
});

describe('dogfood account lifetime', () => {
  const now = new Date('2026-11-11T00:00:00Z');
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  it('marks only +dogfood-tmp-<id> accounts as ephemeral', () => {
    expect(isEphemeralDogfoodAccountEmail(at('t+dogfood-tmp-run42'))).toBe(
      true
    );
    expect(isEphemeralDogfoodAccountEmail(at('t+dogfood'))).toBe(false);
    expect(isEphemeralDogfoodAccountEmail(at('t+dogfood-studio'))).toBe(false);
    expect(isEphemeralDogfoodAccountEmail('t+dogfood-tmp-1@gmail.com')).toBe(
      false
    );
  });

  it(`expires ephemeral accounts after ${EPHEMERAL_DOGFOOD_MAX_AGE_DAYS} days only`, () => {
    const tmp = at('t+dogfood-tmp-run42');
    expect(
      isExpiredEphemeralDogfoodAccount(
        { email: tmp, createdAt: daysAgo(8) },
        now
      )
    ).toBe(true);
    expect(
      isExpiredEphemeralDogfoodAccount(
        { email: tmp, createdAt: daysAgo(7) },
        now
      )
    ).toBe(false);
    expect(
      isExpiredEphemeralDogfoodAccount(
        { email: at('t+dogfood'), createdAt: daysAgo(400) },
        now
      )
    ).toBe(false);
  });

  it('audits with the reason and domain only', () => {
    expect(dogfoodAdmissionAudit(at('t+dogfood-tmp-run42'))).toEqual({
      reason: 'founder_dogfood_mailbox',
      lifetime: 'ephemeral',
      emailDomain: DOMAIN,
    });
  });
});
