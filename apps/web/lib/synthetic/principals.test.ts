import { describe, expect, it } from 'vitest';
import {
  INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN,
  isInternalOrTestAccountEmail,
} from '@/lib/utils/email';
import {
  buildSyntheticPrincipalEmail,
  getActiveSyntheticPrincipal,
  isSyntheticPrincipalEmail,
  parseSyntheticPrincipalEmail,
  resolveSyntheticPrincipal,
  SYNTHETIC_PRINCIPALS,
  syntheticPrincipalStripeMetadata,
} from './principals';

describe('synthetic principal roster', () => {
  it('has unique, tag-safe actor ids', () => {
    const ids = SYNTHETIC_PRINCIPALS.map(principal => principal.actorId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it('names Grokbot, Muse, Instinct and the production canary', () => {
    expect(SYNTHETIC_PRINCIPALS.map(p => p.actorId)).toEqual([
      'grokbot',
      'muse',
      'instinct',
      'canary',
    ]);
  });
});

describe('parseSyntheticPrincipalEmail', () => {
  it.each([
    ['canary+synthetic-grokbot@mail.example', 'grokbot', null],
    ['CANARY+Synthetic-Muse-Run7@Mail.Example', 'muse', 'run7'],
    [
      'ops+synthetic-canary-2026.10.03-a@test.jovie.com',
      'canary',
      '2026.10.03-a',
    ],
    ['ops+synthetic-unknownbot@mail.example', 'unknownbot', null],
    ['ops+jovie-prod-waitlist-canary@mail.example', 'canary', null],
  ])('parses %s', (email, actorId, runTag) => {
    expect(parseSyntheticPrincipalEmail(email)).toEqual({ actorId, runTag });
  });

  it.each([
    ['artist@band.com'],
    ['synthetic-grokbot@mail.example'],
    ['fan+synthetic@gmail.com'],
    ['fan+synthetic-@gmail.com'],
    ['not-an-email'],
    [''],
    [null],
    [undefined],
  ])('rejects %s', email => {
    expect(parseSyntheticPrincipalEmail(email)).toBeNull();
    expect(isSyntheticPrincipalEmail(email)).toBe(false);
  });
});

describe('getActiveSyntheticPrincipal', () => {
  it('grants an active principal its own scenarios', () => {
    expect(
      getActiveSyntheticPrincipal(
        'canary+synthetic-grokbot@mail.example',
        'onboarding_chat'
      )?.actorId
    ).toBe('grokbot');
  });

  it('denies scenarios outside the grant', () => {
    expect(
      getActiveSyntheticPrincipal(
        'canary+synthetic-instinct@mail.example',
        'checkout_test'
      )
    ).toBeNull();
  });

  it('denies unknown actors even though they parse', () => {
    expect(
      getActiveSyntheticPrincipal('ops+synthetic-evilbot@mail.example', 'auth')
    ).toBeNull();
    expect(
      resolveSyntheticPrincipal('ops+synthetic-evilbot@mail.example')
    ).toBe(null);
  });

  it('treats a real customer as ordinary traffic', () => {
    expect(getActiveSyntheticPrincipal('artist@band.com', 'auth')).toBeNull();
  });
});

describe('metrics quarantine composes with the JOV-7362 classifier', () => {
  const sqlPattern = new RegExp(INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN, 'i');

  it.each([
    ...SYNTHETIC_PRINCIPALS.map(p => `ops+synthetic-${p.actorId}@gmail.com`),
    // Unknown or revoked actors stay quarantined; status never un-hides them.
    'ops+synthetic-retiredbot-run1@gmail.com',
    // The existing production waitlist canary identity.
    'ops+jovie-prod-waitlist-canary@gmail.com',
  ])('excludes %s from customer metrics in JS and SQL', email => {
    expect(isInternalOrTestAccountEmail(email)).toBe(true);
    expect(sqlPattern.test(email.toLowerCase())).toBe(true);
  });
});

describe('buildSyntheticPrincipalEmail', () => {
  it('tags the producer mailbox base and replaces an existing plus tag', () => {
    expect(
      buildSyntheticPrincipalEmail(
        'Canary+old@Mail.Example',
        'grokbot',
        'run42'
      )
    ).toBe('canary+synthetic-grokbot-run42@mail.example');
  });

  it('round-trips through the parser', () => {
    const email = buildSyntheticPrincipalEmail('ops@mail.example', 'muse');
    expect(parseSyntheticPrincipalEmail(email)).toEqual({
      actorId: 'muse',
      runTag: null,
    });
  });

  it('refuses unknown actors and malformed input', () => {
    expect(() =>
      buildSyntheticPrincipalEmail('ops@mail.example', 'evilbot')
    ).toThrow(/not active/);
    expect(() =>
      buildSyntheticPrincipalEmail('ops@mail.example', 'muse', 'bad tag!')
    ).toThrow(/malformed/);
    expect(() => buildSyntheticPrincipalEmail('no-at-sign', 'muse')).toThrow(
      /email address/
    );
  });
});

describe('syntheticPrincipalStripeMetadata', () => {
  it('marks a synthetic principal with its actor id', () => {
    expect(
      syntheticPrincipalStripeMetadata('canary+synthetic-canary@mail.example')
    ).toEqual({ synthetic_principal: 'canary' });
  });

  it('adds nothing for real customers', () => {
    expect(syntheticPrincipalStripeMetadata('artist@band.com')).toEqual({});
    expect(syntheticPrincipalStripeMetadata('')).toEqual({});
  });
});
