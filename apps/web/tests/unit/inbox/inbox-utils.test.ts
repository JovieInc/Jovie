/**
 * Unit tests for Inbox utility functions.
 *
 * Tests pure functions from constants.ts and router.ts:
 * - normalizeSubject: strip Re:/Fwd: prefixes, handle nullish values
 * - getTerritorySpecificity: known territories, regions, worldwide, unknowns
 * - CATEGORY_TO_CONTACT_ROLE: all AI category -> contact role mappings
 * - findBestTerritoryMatch: territory tiebreaker logic
 * - formatRoleLabel: human-readable role labels
 */

import { describe, expect, it, vi } from 'vitest';

import {
  CATEGORY_TO_CONTACT_ROLE,
  getTerritorySpecificity,
  normalizeSubject,
} from '@/lib/inbox/constants';

// ---------------------------------------------------------------------------
// normalizeSubject
// ---------------------------------------------------------------------------

describe('normalizeSubject', () => {
  it('returns empty string for null', () => {
    expect(normalizeSubject(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeSubject(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeSubject('')).toBe('');
  });

  it('strips "Re: " prefix', () => {
    expect(normalizeSubject('Re: Hello')).toBe('Hello');
  });

  it('strips "Fwd: " prefix', () => {
    expect(normalizeSubject('Fwd: Hello')).toBe('Hello');
  });

  it('strips "RE: FW: " double prefix', () => {
    expect(normalizeSubject('RE: FW: Hello')).toBe('Hello');
  });

  it('strips nested "re: re: " prefixes (up to two)', () => {
    expect(normalizeSubject('re: re: Hello')).toBe('Hello');
  });

  it('returns subject unchanged when no prefix', () => {
    expect(normalizeSubject('Hello World')).toBe('Hello World');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeSubject('  Hello  ')).toBe('Hello');
  });

  it('strips prefix and trims whitespace when prefix is at start', () => {
    expect(normalizeSubject('Re:   Hello  ')).toBe('Hello');
  });

  it('does not strip prefix when leading whitespace precedes it', () => {
    // The regex anchors on ^ so leading spaces prevent the match
    expect(normalizeSubject('  Re:   Hello  ')).toBe('Re:   Hello');
  });

  it('is case-insensitive for prefixes', () => {
    expect(normalizeSubject('RE: Hello')).toBe('Hello');
    expect(normalizeSubject('re: Hello')).toBe('Hello');
    expect(normalizeSubject('FWD: Hello')).toBe('Hello');
    expect(normalizeSubject('fwd: Hello')).toBe('Hello');
  });

  it('handles "fw:" prefix', () => {
    expect(normalizeSubject('fw: Some subject')).toBe('Some subject');
  });
});

// ---------------------------------------------------------------------------
// getTerritorySpecificity
// ---------------------------------------------------------------------------

describe('getTerritorySpecificity', () => {
  it('returns 100 for known country "USA"', () => {
    expect(getTerritorySpecificity('USA')).toBe(100);
  });

  it('returns 100 for known country "UK"', () => {
    expect(getTerritorySpecificity('UK')).toBe(100);
  });

  it('returns 100 for known country "Japan"', () => {
    expect(getTerritorySpecificity('Japan')).toBe(100);
  });

  it('returns 50 for region "North America"', () => {
    expect(getTerritorySpecificity('North America')).toBe(50);
  });

  it('returns 50 for region "Europe"', () => {
    expect(getTerritorySpecificity('Europe')).toBe(50);
  });

  it('returns 50 for region "Europe (ex-UK)"', () => {
    expect(getTerritorySpecificity('Europe (ex-UK)')).toBe(50);
  });

  it('returns 1 for "Worldwide"', () => {
    expect(getTerritorySpecificity('Worldwide')).toBe(1);
  });

  it('returns 75 (default) for unknown territory', () => {
    expect(getTerritorySpecificity('Narnia')).toBe(75);
  });

  it('returns 75 for empty string (not in map)', () => {
    expect(getTerritorySpecificity('')).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// CATEGORY_TO_CONTACT_ROLE
// ---------------------------------------------------------------------------

describe('CATEGORY_TO_CONTACT_ROLE', () => {
  it('maps booking to bookings', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.booking).toBe('bookings');
  });

  it('maps music_collaboration to music_collaboration', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.music_collaboration).toBe(
      'music_collaboration'
    );
  });

  it('maps brand_partnership to brand_partnerships', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.brand_partnership).toBe(
      'brand_partnerships'
    );
  });

  it('maps management to management', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.management).toBe('management');
  });

  it('maps business to management', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.business).toBe('management');
  });

  it('maps press to press_pr', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.press).toBe('press_pr');
  });

  it('maps fan_mail to fan_general', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.fan_mail).toBe('fan_general');
  });

  it('maps personal to fan_general', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.personal).toBe('fan_general');
  });

  it('maps spam to null (no routing)', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.spam).toBeNull();
  });

  it('maps other to null (no routing)', () => {
    expect(CATEGORY_TO_CONTACT_ROLE.other).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findBestTerritoryMatch (exported from router.ts)
// ---------------------------------------------------------------------------

// We need to mock router.ts dependencies before importing the pure functions.
// findBestTerritoryMatch and formatRoleLabel don't use db/Resend/env at the
// module level, but router.ts imports them. We mock the side-effectful imports
// so the module can load cleanly.

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorContacts: { $inferSelect: {} },
  creatorProfiles: {},
}));

vi.mock('@/lib/db/schema/inbox', () => ({
  emailThreads: {},
  outboundReplies: {},
  inboundEmails: {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { findBestTerritoryMatch, formatRoleLabel } from '@/lib/inbox/router';

// Helper to create a mock contact object matching Drizzle schema shape
function createMockContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    creatorProfileId: 'profile-1',
    role: 'bookings' as const,
    customLabel: null,
    personName: 'Agent Smith',
    companyName: 'Booking Co',
    territories: ['USA'],
    email: 'agent@booking.com',
    phone: null,
    preferredChannel: 'email' as const,
    isActive: true,
    sortOrder: 0,
    forwardInboxEmails: true,
    autoMarkRead: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never; // cast to satisfy the Drizzle inferred type
}

describe('findBestTerritoryMatch', () => {
  it('returns the first contact when territory is null', () => {
    const contacts = [
      createMockContact({ id: 'c1', territories: ['USA'] }),
      createMockContact({ id: 'c2', territories: ['UK'] }),
    ];
    const result = findBestTerritoryMatch(contacts, null);
    expect((result as Record<string, unknown>)?.id).toBe('c1');
  });

  it('returns the single contact when only one exists', () => {
    const contacts = [createMockContact({ id: 'c1', territories: ['USA'] })];
    const result = findBestTerritoryMatch(contacts, 'UK');
    expect((result as Record<string, unknown>)?.id).toBe('c1');
  });

  it('returns null for empty contacts array', () => {
    const result = findBestTerritoryMatch([] as never[], 'USA');
    expect(result).toBeNull();
  });

  it('matches contact with exact territory (country-level)', () => {
    const contacts = [
      createMockContact({ id: 'c-usa', territories: ['USA'] }),
      createMockContact({ id: 'c-uk', territories: ['UK'] }),
    ];
    const result = findBestTerritoryMatch(contacts, 'UK');
    expect((result as Record<string, unknown>)?.id).toBe('c-uk');
  });

  it('prefers country (specificity 100) over region (specificity 50)', () => {
    const contacts = [
      createMockContact({
        id: 'c-region',
        territories: ['North America'],
      }),
      createMockContact({ id: 'c-country', territories: ['USA'] }),
    ];
    const result = findBestTerritoryMatch(contacts, 'USA');
    expect((result as Record<string, unknown>)?.id).toBe('c-country');
  });

  it('prefers region over worldwide (specificity 1)', () => {
    const contacts = [
      createMockContact({ id: 'c-ww', territories: ['Worldwide'] }),
      createMockContact({
        id: 'c-region',
        territories: ['North America'],
      }),
    ];
    const result = findBestTerritoryMatch(contacts, 'North America');
    expect((result as Record<string, unknown>)?.id).toBe('c-region');
  });

  it('falls back to first contact when no territory matches', () => {
    const contacts = [
      createMockContact({ id: 'c1', territories: ['UK'] }),
      createMockContact({ id: 'c2', territories: ['Germany'] }),
    ];
    const result = findBestTerritoryMatch(contacts, 'Japan');
    expect((result as Record<string, unknown>)?.id).toBe('c1');
  });

  it('handles contacts with empty territories (worldwide fallback)', () => {
    const contacts = [
      createMockContact({ id: 'c-empty', territories: [] }),
      createMockContact({ id: 'c-usa', territories: ['USA'] }),
    ];
    const result = findBestTerritoryMatch(contacts, 'USA');
    expect((result as Record<string, unknown>)?.id).toBe('c-usa');
  });

  it('uses empty-territory contact as fallback when nothing else matches', () => {
    const contacts = [
      createMockContact({ id: 'c-empty', territories: [] }),
      createMockContact({ id: 'c-uk', territories: ['UK'] }),
    ];
    const result = findBestTerritoryMatch(contacts, 'Japan');
    // No territory matches Japan; c-empty (worldwide) has specificity 0
    // fallback to first contact (c-empty)
    expect((result as Record<string, unknown>)?.id).toBe('c-empty');
  });

  it('handles case-insensitive territory matching', () => {
    const contacts = [
      createMockContact({ id: 'c1', territories: ['usa'] }),
      createMockContact({ id: 'c2', territories: ['UK'] }),
    ];
    const result = findBestTerritoryMatch(contacts, 'USA');
    expect((result as Record<string, unknown>)?.id).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// formatRoleLabel
// ---------------------------------------------------------------------------

describe('formatRoleLabel', () => {
  it('returns "bookings" for bookings role', () => {
    expect(formatRoleLabel('bookings')).toBe('bookings');
  });

  it('returns "management" for management role', () => {
    expect(formatRoleLabel('management')).toBe('management');
  });

  it('returns "press & PR" for press_pr role', () => {
    expect(formatRoleLabel('press_pr')).toBe('press & PR');
  });

  it('returns "brand partnerships" for brand_partnerships role', () => {
    expect(formatRoleLabel('brand_partnerships')).toBe('brand partnerships');
  });

  it('returns "music collaborations" for music_collaboration role', () => {
    expect(formatRoleLabel('music_collaboration')).toBe('music collaborations');
  });

  it('returns "fan inquiries" for fan_general role', () => {
    expect(formatRoleLabel('fan_general')).toBe('fan inquiries');
  });

  it('returns the role string as-is for unknown roles', () => {
    expect(formatRoleLabel('unknown_role')).toBe('unknown_role');
  });
});
