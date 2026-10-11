import { describe, expect, it } from 'vitest';
import { canonicalContactMatchesSearch } from '@/lib/admin/contacts';

const contact = {
  dedupeKey: 'email:ada@example.com',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  handle: 'ada-lovelace',
  userId: 'user-1',
  creatorProfileId: 'profile-1',
  leadId: 'lead-1',
  waitlistEntryId: 'waitlist-1',
};

describe('canonicalContactMatchesSearch', () => {
  it('supports fuzzy identity text and exact linked identifiers', () => {
    expect(canonicalContactMatchesSearch(contact, 'lovelace')).toBe(true);
    expect(canonicalContactMatchesSearch(contact, 'PROFILE-1')).toBe(true);
    expect(canonicalContactMatchesSearch(contact, 'waitlist-1')).toBe(true);
  });

  it('does not treat partial linked identifiers as a customer match', () => {
    expect(canonicalContactMatchesSearch(contact, 'profile')).toBe(false);
    expect(canonicalContactMatchesSearch(contact, 'missing-id')).toBe(false);
  });
});
