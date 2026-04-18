import { describe, expect, it } from 'vitest';

import {
  getEmailDomain,
  getEmailSendBlockReason,
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
