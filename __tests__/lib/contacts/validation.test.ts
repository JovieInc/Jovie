import { describe, expect, it } from 'vitest';
import {
  normalizeTerritories,
  sanitizeContactInput,
} from '@/lib/contacts/validation';

describe('normalizeTerritories', () => {
  it('keeps Worldwide exclusive and deduplicates', () => {
    const result = normalizeTerritories([
      'Worldwide',
      'North America',
      'Worldwide',
      '  Europe (ex-UK) ',
    ]);

    expect(result).toEqual(['Worldwide']);
  });

  it('removes blanks and trims whitespace', () => {
    const result = normalizeTerritories(['  USA', 'Canada', ' ', 'USA  ']);
    expect(result).toEqual(['USA', 'Canada']);
  });
});

describe('sanitizeContactInput', () => {
  it('normalizes preferred channel when only one channel exists', () => {
    const sanitized = sanitizeContactInput({
      profileId: 'profile-123',
      id: 'contact-1',
      role: 'bookings',
      territories: [],
      email: 'agent@example.com',
      phone: null,
    });

    expect(sanitized.preferredChannel).toBe('email');
  });

  it('throws when no channels are provided', () => {
    expect(() =>
      sanitizeContactInput({
        profileId: 'profile-123',
        id: 'contact-1',
        role: 'bookings',
        territories: [],
        email: null,
        phone: null,
      })
    ).toThrowError(/Add at least one contact channel/);
  });
});
