/**
 * Unit tests for the contacts mapper (toPublicContacts).
 *
 * Tests the transformation from database CreatorContact records
 * to PublicContact objects used in public profile rendering.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the obfuscation module
vi.mock('@/lib/contacts/obfuscation', () => ({
  encodeContactPayload: vi.fn(
    (payload: { type: string; value: string; contactId: string }) =>
      `encoded:${payload.type}:${payload.value}`
  ),
}));

// Mock the constants module
vi.mock('@/lib/contacts/constants', () => ({
  buildRoleSubject: vi.fn(
    (role: string, artistName: string) => `${role} inquiry for ${artistName}`
  ),
  getContactRoleLabel: vi.fn(
    (role: string, customLabel?: string | null) => customLabel || role
  ),
  summarizeTerritories: vi.fn((territories: string[]) => ({
    summary: territories.length > 0 ? territories.join(', ') : 'Worldwide',
    count: territories.length,
  })),
}));

import { toPublicContacts } from '@/lib/contacts/mapper';

// Helper to create a mock CreatorContact (Drizzle schema format)
function createContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    creatorProfileId: 'profile-123',
    role: 'bookings' as const,
    customLabel: null,
    personName: 'John Doe',
    companyName: 'Booking Agency',
    territories: ['US', 'EU'],
    email: 'john@booking.com',
    phone: null,
    preferredChannel: 'email' as const,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('toPublicContacts', () => {
  it('converts a contact with email to public format', () => {
    const contacts = [createContact()];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('contact-1');
    expect(result[0].role).toBe('bookings');
    expect(result[0].channels).toHaveLength(1);
    expect(result[0].channels[0].type).toBe('email');
    expect(result[0].channels[0].encoded).toBe(
      'encoded:email:john@booking.com'
    );
  });

  it('converts a contact with both email and phone', () => {
    const contacts = [
      createContact({
        email: 'john@booking.com',
        phone: '+1-555-0123',
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].channels).toHaveLength(2);
    expect(result[0].channels[0].type).toBe('email');
    expect(result[0].channels[1].type).toBe('phone');
  });

  it('marks preferred channel correctly', () => {
    const contacts = [
      createContact({
        email: 'john@booking.com',
        phone: '+1-555-0123',
        preferredChannel: 'email',
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    const emailChannel = result[0].channels.find(c => c.type === 'email');
    const phoneChannel = result[0].channels.find(c => c.type === 'phone');
    expect(emailChannel?.preferred).toBe(true);
    expect(phoneChannel?.preferred).toBe(false);
  });

  it('auto-marks sole channel as preferred when none specified', () => {
    const contacts = [
      createContact({
        email: 'john@booking.com',
        phone: null,
        preferredChannel: null,
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].channels).toHaveLength(1);
    expect(result[0].channels[0].preferred).toBe(true);
  });

  it('filters out contacts with no channels (no email or phone)', () => {
    const contacts = [
      createContact({
        email: null,
        phone: null,
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result).toHaveLength(0);
  });

  it('filters out inactive contacts', () => {
    const contacts = [createContact({ isActive: false })];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result).toHaveLength(0);
  });

  it('sorts contacts by sortOrder', () => {
    const contacts = [
      createContact({ id: 'contact-2', sortOrder: 2 }),
      createContact({ id: 'contact-1', sortOrder: 1 }),
      createContact({ id: 'contact-3', sortOrder: 0 }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].id).toBe('contact-3');
    expect(result[1].id).toBe('contact-1');
    expect(result[2].id).toBe('contact-2');
  });

  it('builds secondary label from person name and company', () => {
    const contacts = [
      createContact({
        personName: 'John Doe',
        companyName: 'Booking Agency',
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].secondaryLabel).toBe('John Doe @ Booking Agency');
  });

  it('handles missing person name in secondary label', () => {
    const contacts = [
      createContact({
        personName: null,
        companyName: 'Booking Agency',
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].secondaryLabel).toBe('Booking Agency');
  });

  it('handles missing company in secondary label', () => {
    const contacts = [
      createContact({
        personName: 'John Doe',
        companyName: null,
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].secondaryLabel).toBe('John Doe');
  });

  it('omits secondary label when both name and company are null', () => {
    const contacts = [
      createContact({
        personName: null,
        companyName: null,
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].secondaryLabel).toBeUndefined();
  });

  it('includes territory summary and count', () => {
    const contacts = [createContact({ territories: ['US', 'EU'] })];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].territorySummary).toBe('US, EU');
    expect(result[0].territoryCount).toBe(2);
  });

  it('handles empty territories', () => {
    const contacts = [createContact({ territories: [] })];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result[0].territorySummary).toBe('Worldwide');
    expect(result[0].territoryCount).toBe(0);
  });

  it('handles empty contacts array', () => {
    const result = toPublicContacts([], 'Test Artist');
    expect(result).toEqual([]);
  });

  it('processes multiple contacts correctly', () => {
    const contacts = [
      createContact({
        id: 'c1',
        role: 'bookings',
        email: 'bookings@test.com',
        sortOrder: 0,
      }),
      createContact({
        id: 'c2',
        role: 'management',
        email: 'mgmt@test.com',
        sortOrder: 1,
      }),
      createContact({
        id: 'c3',
        role: 'press_pr',
        email: 'press@test.com',
        sortOrder: 2,
      }),
    ];
    const result = toPublicContacts(contacts, 'Test Artist');

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('bookings');
    expect(result[1].role).toBe('management');
    expect(result[2].role).toBe('press_pr');
  });
});
