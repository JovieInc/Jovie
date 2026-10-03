import { describe, expect, it } from 'vitest';

import {
  getEmailDomain,
  getEmailSendBlockReason,
  INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN,
  isInternalOrTestAccountEmail,
  isReservedTestEmailDomain,
  normalizeEmail,
} from '@/lib/utils/email';

describe('email utils', () => {
  it('normalizes email addresses', () => {
    expect(normalizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
  });

  it('extracts normalized email domains', () => {
    expect(getEmailDomain('  Person@Sub.Example.com  ')).toBe(
      'sub.example.com'
    );
  });

  it('detects reserved test domains and subdomains', () => {
    expect(isReservedTestEmailDomain('example.com')).toBe(true);
    expect(isReservedTestEmailDomain('qa.example.com')).toBe(true);
    expect(isReservedTestEmailDomain('mail.localhost')).toBe(true);
    expect(isReservedTestEmailDomain('customer.com')).toBe(false);
  });

  it('returns a send block reason for reserved test domains', () => {
    expect(getEmailSendBlockReason('tester@example.com')).toContain(
      'reserved for testing'
    );
    expect(getEmailSendBlockReason('person@real-domain.com')).toBeNull();
  });
});

describe('isInternalOrTestAccountEmail', () => {
  it.each([
    ['tim@jov.ie', 'team inbox on jov.ie'],
    ['anyone@staging.jov.ie', 'jov.ie subdomain'],
    ['browse+clerk_test@jov.ie', 'clerk test tag'],
    ['someone+clerk_test@gmail.com', 'clerk test tag on external domain'],
    ['e2e-42@jov.ie', 'e2e prefix'],
    ['browse-admin+clerk_test@jov.ie', 'browse prefix with tag'],
    ['auth-qa-1@jov.ie', 'auth-qa prefix'],
    ['test-signup@example.org', 'test prefix + reserved domain'],
    ['demo@jov.ie', 'demo local part'],
    ['dualipa-public@jov.ie', 'demo placeholder suffix'],
    ['seeded@data.test', 'reserved .test domain'],
    ['auth-surface-qa+clerk_test@test.jovie.com', 'dogfood QA domain'],
    ['money-referrer-123@test.jovie.com', 'e2e dogfood email'],
    ['anyone@staging.test.jovie.com', 'dogfood subdomain'],
  ])('excludes %s (%s)', email => {
    expect(isInternalOrTestAccountEmail(email)).toBe(true);
  });

  it.each([
    ['artist@band.com'],
    ['dogfood-tim@gmail.com'],
    ['e2e@anything.dev'],
    ['smoke-run@qa.vendor.io'],
    ['staging-check@corp.net'],
    ['demo@label.co'],
    ['artist-public@label.co'],
    ['fan.name@gmail.com'],
    ['latest.music@outlook.com'],
    ['contestant@exampled.com'],
    [' publicist@label.co '],
    [null],
    [undefined],
    ['not-an-email'],
  ])('keeps %s as an external account', email => {
    expect(isInternalOrTestAccountEmail(email)).toBe(false);
  });

  // INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN is the Postgres `~*` copy of the JS
  // classifier. Both must agree or SQL aggregate counts would diverge from
  // per-row filtering (JOV-7362).
  const sqlPattern = new RegExp(INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN, 'i');

  it.each([
    ['tim@jov.ie'],
    ['auth-surface-qa+clerk_test@test.jovie.com'],
    ['money-referrer-123@test.jovie.com'],
    ['anyone@staging.test.jovie.com'],
    ['e2e-42@jov.ie'],
    ['dualipa-public@jov.ie'],
    ['seeded@data.test'],
  ])('SQL pattern excludes %s', email => {
    expect(sqlPattern.test(email.toLowerCase())).toBe(true);
  });

  it.each([
    ['artist@band.com'],
    ['fan.name@gmail.com'],
    ['quality@band.com'],
    ['dogfood-tim@gmail.com'],
    ['demo@label.co'],
    ['artist-public@label.co'],
  ])('SQL pattern keeps %s external', email => {
    expect(sqlPattern.test(email.toLowerCase())).toBe(false);
  });
});
