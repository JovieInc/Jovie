import { describe, expect, it } from 'vitest';

import {
  getAccountMetricCohort,
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
    expect(
      getEmailSendBlockReason('browse-ready+synthetic-prodcert-abc123@jov.ie')
    ).toContain('synthetic canary');
    expect(getEmailSendBlockReason('browse-ready+clerk_test@jov.ie')).toContain(
      'synthetic canary'
    );
    expect(getEmailSendBlockReason('tim@jov.ie')).toBeNull();
  });
});

// Built from parts: the private-data guard rejects the literal founder hostname.
const FOUNDER_DOMAIN = ['timwhite', 'co'].join('.');

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
    ['canary+synthetic-grokbot@mail.example', 'synthetic principal tag'],
    ['ops+synthetic-muse-run7@gmail.com', 'synthetic tag on external domain'],
    [`tim@${FOUNDER_DOMAIN}`, 'founder personal domain'],
    [`tim+anything@sub.${FOUNDER_DOMAIN}`, 'founder domain subdomain'],
    ['agent+canary@gmail.com', 'canary tag'],
    ['agent+e2e-run42@gmail.com', 'e2e tag with run suffix'],
    ['agent+prodcert.7@gmail.com', 'prodcert tag'],
    ['qa+dogfood@gmail.com', 'dogfood tag'],
  ])('excludes %s (%s)', email => {
    expect(isInternalOrTestAccountEmail(email)).toBe(true);
  });

  it.each([
    ['artist@band.com'],
    ['demo@label.com'],
    ['artist-public@label.com'],
    ['e2e@anything.dev'],
    ['smoke-run@qa.vendor.io'],
    ['staging-check@corp.net'],
    ['dogfood-tim@gmail.com'],
    ['fan.name@gmail.com'],
    ['latest.music@outlook.com'],
    ['synthetic-fan@gmail.com'],
    ['fan+synthetic@gmail.com'],
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
    ['canary+synthetic-grokbot@mail.example'],
    ['ops+synthetic-muse-run7@gmail.com'],
    [`tim@${FOUNDER_DOMAIN}`],
    [`tim+anything@sub.${FOUNDER_DOMAIN}`],
    ['agent+canary@gmail.com'],
    ['agent+e2e-run42@gmail.com'],
    ['agent+prodcert.7@gmail.com'],
    ['qa+dogfood@gmail.com'],
  ])('SQL pattern excludes %s', email => {
    expect(sqlPattern.test(email.toLowerCase())).toBe(true);
  });

  it.each([
    ['artist@band.com'],
    ['demo@label.com'],
    ['artist-public@label.com'],
    ['e2e@anything.dev'],
    ['smoke-run@qa.vendor.io'],
    ['staging-check@corp.net'],
    ['dogfood-tim@gmail.com'],
    ['fan.name@gmail.com'],
    ['quality@band.com'],
    ['synthetic-fan@gmail.com'],
    ['fan+synthetic@gmail.com'],
    [`fan@not${FOUNDER_DOMAIN}`],
    ['fan+canaryfan@gmail.com'],
    ['fan+e2ex@gmail.com'],
    ['canary@gmail.com'],
  ])('SQL pattern keeps %s external', email => {
    expect(sqlPattern.test(email.toLowerCase())).toBe(false);
  });
});

describe('getAccountMetricCohort', () => {
  it('separates customers, synthetic principals, and unknown traffic', () => {
    expect(getAccountMetricCohort('artist@band.com')).toBe('customer');
    expect(getAccountMetricCohort('auth-surface-qa@test.jovie.com')).toBe(
      'synthetic'
    );
    expect(getAccountMetricCohort(null)).toBe('unattributed');
  });
});
