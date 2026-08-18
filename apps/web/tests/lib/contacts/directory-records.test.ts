import { describe, expect, it } from 'vitest';
import { toDashboardContacts } from '@/lib/contacts/directory-records';

const profileId = 'profile-1';
const createdAt = new Date('2026-08-17T00:00:00.000Z');

function record(input: {
  personId: string;
  displayName: string;
  assignmentId: string;
  role: 'bookings' | 'management' | 'other';
  customLabel?: string | null;
  territories?: string[];
  isActive?: boolean;
  isPrimary?: boolean;
  sortOrder?: number;
}) {
  return {
    person: {
      id: input.personId,
      creatorProfileId: profileId,
      displayName: input.displayName,
      companyName: null,
      email: `${input.personId}@example.com`,
      phone: null,
      preferredChannel: 'email' as const,
    },
    assignment: {
      id: input.assignmentId,
      territories: input.territories ?? [],
      isActive: input.isActive ?? true,
      isPrimary: input.isPrimary ?? false,
      sortOrder: input.sortOrder ?? 0,
      startedAt: createdAt,
      endedAt: null,
    },
    responsibility: {
      role: input.role,
      customLabel: input.customLabel ?? null,
    },
  };
}

describe('contact directory records', () => {
  it('groups multiple assignments under one person while sharing a responsibility across people', () => {
    const contacts = toDashboardContacts(
      [
        record({
          personId: 'alice',
          displayName: 'Alice Agent',
          assignmentId: 'alice-management',
          role: 'management',
          isPrimary: true,
        }),
        record({
          personId: 'alice',
          displayName: 'Alice Agent',
          assignmentId: 'alice-bookings',
          role: 'bookings',
          territories: ['North America'],
          sortOrder: 1,
        }),
        record({
          personId: 'bob',
          displayName: 'Bob Booker',
          assignmentId: 'bob-bookings',
          role: 'bookings',
          territories: ['Europe'],
          isPrimary: true,
          sortOrder: 2,
        }),
      ],
      profileId
    );

    expect(contacts).toHaveLength(2);
    expect(
      contacts.find(contact => contact.id === 'alice')?.responsibilities
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'management' }),
        expect.objectContaining({
          role: 'bookings',
          territories: ['North America'],
        }),
      ])
    );
    expect(
      contacts.find(contact => contact.id === 'bob')?.responsibilities
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'bookings', territories: ['Europe'] }),
      ])
    );
  });

  it('adds the visible Jovie manager fallback only when there is no active human manager', () => {
    const contacts = toDashboardContacts(
      [
        record({
          personId: 'alice',
          displayName: 'Alice Agent',
          assignmentId: 'alice-bookings',
          role: 'bookings',
          isPrimary: true,
        }),
      ],
      profileId
    );

    expect(contacts).toHaveLength(2);
    expect(contacts.find(contact => contact.isSystemDefault)).toMatchObject({
      id: 'system:jovie-default-manager',
      personName: 'Jovie',
      role: 'management',
    });
    expect(contacts.some(contact => contact.id === 'alice')).toBe(true);
  });

  it('does not treat an inactive historic manager as an active human manager', () => {
    const contacts = toDashboardContacts(
      [
        record({
          personId: 'former-manager',
          displayName: 'Former Manager',
          assignmentId: 'former-manager-management',
          role: 'management',
          isActive: false,
          isPrimary: true,
        }),
      ],
      profileId
    );

    expect(contacts.find(contact => contact.isSystemDefault)).toBeDefined();
    expect(
      contacts.find(contact => contact.id === 'former-manager')
        ?.responsibilities?.[0]?.isActive
    ).toBe(false);
  });
});
