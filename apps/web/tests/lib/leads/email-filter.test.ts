import { describe, expect, it } from 'vitest';
import { filterEmail } from '@/lib/leads/email-filter';

describe('filterEmail', () => {
  it('marks disposable domains as invalid', () => {
    expect(filterEmail('artist@mailinator.com')).toEqual({
      invalid: true,
      suspicious: false,
      reason: 'Disposable email domain',
    });
  });

  it('marks role-based prefixes as suspicious', () => {
    expect(filterEmail('donotreply@label.com')).toEqual({
      invalid: false,
      suspicious: true,
      reason: 'Role-based address: donotreply',
    });
  });

  it('marks long random-looking local parts as invalid spam-trap patterns', () => {
    const result = filterEmail('x9qztrplmnvbcdfghjklwrtpsszz12@label.com');

    expect(result).toEqual({
      invalid: true,
      suspicious: false,
      reason: 'Spam trap pattern: random local part',
    });
  });
});
