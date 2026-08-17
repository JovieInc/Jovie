import { describe, expect, it } from 'vitest';
import {
  type ContactAssignmentCandidate,
  selectContactAssignment,
} from '@/lib/contacts/assignment-selection';

function candidate(
  overrides: Partial<ContactAssignmentCandidate>
): ContactAssignmentCandidate {
  return {
    personId: 'person-a',
    displayName: 'Alex',
    role: 'bookings',
    territories: [],
    isPrimary: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe('selectContactAssignment', () => {
  it('prefers an exact territory match before a primary worldwide assignment', () => {
    const selected = selectContactAssignment(
      [
        candidate({
          personId: 'worldwide-primary',
          territories: ['Worldwide'],
          isPrimary: true,
        }),
        candidate({
          personId: 'regional',
          territories: ['Europe'],
          isPrimary: false,
        }),
      ],
      'Europe'
    );

    expect(selected?.personId).toBe('regional');
  });

  it('uses primary, sort order, display name, then person id as documented tie-breakers', () => {
    const selected = selectContactAssignment(
      [
        candidate({
          personId: 'zeta',
          displayName: 'Zoe',
          sortOrder: 0,
        }),
        candidate({
          personId: 'beta',
          displayName: 'Bree',
          sortOrder: 0,
        }),
        candidate({
          personId: 'primary',
          displayName: 'Zara',
          isPrimary: true,
          sortOrder: 9,
        }),
      ],
      null
    );

    expect(selected?.personId).toBe('primary');

    const alphabetical = selectContactAssignment(
      [
        candidate({ personId: 'zeta', displayName: 'Zoe' }),
        candidate({ personId: 'beta', displayName: 'Bree' }),
      ],
      null
    );
    expect(alphabetical?.personId).toBe('beta');

    const byId = selectContactAssignment(
      [
        candidate({ personId: 'b', displayName: 'Same' }),
        candidate({ personId: 'a', displayName: 'Same' }),
      ],
      null
    );
    expect(byId?.personId).toBe('a');
  });

  it('does not route a regional assignment outside its assignment territory', () => {
    const selected = selectContactAssignment(
      [
        candidate({
          personId: 'europe-agent',
          territories: ['Europe'],
          isPrimary: true,
        }),
      ],
      'Japan'
    );

    expect(selected).toBeNull();
  });
});
