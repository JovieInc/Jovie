import { describe, expect, it } from 'vitest';
import {
  isTestProfileOwnerEmail,
  TEST_PROFILE_OWNER_EMAIL_SQL_PATTERN,
} from '@/lib/utils/email';
import { redactTestEmail } from './test-profile-cleanup';
import {
  isTestProfile,
  isTestProfileCleanupProtected,
  shouldHideTestProfileFromDirectUrl,
} from './test-profile-policy';

const TEST_EMAILS = [
  'gp-mo9o4852+clerk_test@test.jovie.com',
  'gp-abc+e2e@test.jovie.com',
  'qatest10+clerk_test@jovie.fm',
  'jovie.qa.test+clerk_test@gmail.com',
  'e2e@jov.ie',
  'browse-ready+clerk_test@jov.ie',
  'e2e-run1@jov.ie',
  'someone@example.com',
  'x@foo.invalid',
  'a+synthetic-grokbot-run42@mail.example',
  'a+jovie-prod-waitlist-canary@gmail.com',
  'a+canary@gmail.com',
  'a+e2e-run42@gmail.com',
  'a+prodcert@gmail.com',
  'a+dogfood@gmail.com',
  'A+CLERK_TEST@GMAIL.COM',
];

const REAL_LOOKALIKES = [
  'tim@gmail.com',
  'tim@jov.ie',
  'tim@timwhite.co',
  'test@gmail.com',
  'e2e@gmail.com',
  'clerk_test@gmail.com',
  'a+clerk_testing@gmail.com',
  'a+clerk_tester@gmail.com',
  'a+e2eish@gmail.com',
  'a+canaryx@gmail.com',
  'qa@jovie.fm',
  'browsecat@jov.ie',
  'e2eclaim@jov.ie',
  'e2e@notjov.ie',
  'e2e@jov.ie.evil.com',
  'artist@attest.jovie.com',
  'artist@mytest.jovie.com',
  'artist@testjovie.com',
  'artist@example.com.au',
  'artist@gmail.com',
  '',
  null,
  undefined,
];

describe('isTestProfileOwnerEmail', () => {
  it.each(TEST_EMAILS)('matches test account %s', email => {
    expect(isTestProfileOwnerEmail(email)).toBe(true);
  });

  it.each(REAL_LOOKALIKES)('rejects look-alike real address %s', email => {
    expect(isTestProfileOwnerEmail(email)).toBe(false);
  });

  it('SQL prefilter is a superset of the JS classifier', () => {
    const re = new RegExp(TEST_PROFILE_OWNER_EMAIL_SQL_PATTERN, 'i');
    for (const email of TEST_EMAILS) {
      expect(re.test(email.toLowerCase()), email).toBe(true);
    }
    for (const email of REAL_LOOKALIKES) {
      if (email) expect(re.test(email.toLowerCase()), email).toBe(false);
    }
  });
});

describe('test profile route policy', () => {
  it('hides non-exempt test profiles', () => {
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'tmo9o49ccvw8mlg',
        ownerEmail: 'gp-mo9o4852+clerk_test@test.jovie.com',
      })
    ).toBe(true);
  });

  it('keeps exempt canaries viewable by handle, email and per-run setting', () => {
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'authqaprod',
        ownerEmail: 'x+clerk_test@jov.ie',
      })
    ).toBe(false);
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'whatever',
        ownerEmail: 'browse-ready+clerk_test@jov.ie',
      })
    ).toBe(false);
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'unmarked-pavement',
        ownerEmail: 'browse-ready+canary-admitted@jov.ie',
      })
    ).toBe(false);
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'good-dropouts-canary',
        ownerEmail: 'browse-ready+chat-health@jov.ie',
      })
    ).toBe(false);
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'whatever',
        ownerEmail: 'gp-1+e2e@test.jovie.com',
        settings: { testProfileDirectUrlExempt: true },
      })
    ).toBe(false);
  });

  it('never hides a real profile', () => {
    expect(
      shouldHideTestProfileFromDirectUrl({
        handle: 'realartist',
        ownerEmail: 'artist@gmail.com',
      })
    ).toBe(false);
    expect(isTestProfile({ ownerEmail: null })).toBe(false);
  });

  it('cleanup protects exact canaries but not per-run exemptions', () => {
    expect(
      isTestProfileCleanupProtected({
        handle: 'authqaprod',
        ownerEmail: 'a@jov.ie',
      })
    ).toBe(true);
    expect(
      isTestProfileCleanupProtected({
        handle: 'tabc',
        ownerEmail: 'gp-1+e2e@test.jovie.com',
      })
    ).toBe(false);
  });

  it('redacts everything but the test marker', () => {
    expect(redactTestEmail('gp-mo9o4852+clerk_test@test.jovie.com')).toBe(
      '***+clerk_test@test.jovie.com'
    );
    expect(redactTestEmail('e2e@jov.ie')).toBe('***e2e@jov.ie');
  });
});
