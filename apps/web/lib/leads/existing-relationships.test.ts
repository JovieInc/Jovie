import { describe, expect, it } from 'vitest';
import {
  EXISTING_RELATIONSHIPS,
  type ExistingRelationshipRegistry,
  existingRelationshipHold,
  existingRelationshipNotes,
  normalizeRelationshipKey,
} from './existing-relationships';

const VIA = (name: string) =>
  `Existing relationship via ${name}: flag to Tim, no cold outreach`;

/** A test-only organization, so no real domain is asserted beyond the registry. */
const FIXTURE: ExistingRelationshipRegistry = {
  artists: [],
  organizations: [
    {
      name: 'Fixture Management',
      domains: ['fixture-mgmt.example'],
      kind: 'block',
      addedAt: '2026-11-12',
    },
  ],
  contacts: [{ name: 'Fixture Contact', addedAt: '2026-11-12' }],
};

describe('existingRelationshipHold', () => {
  it('holds Dannic by handle, with or without the @', () => {
    for (const handle of ['djdannic', '@DJDannic', 'dannic', ' @dannic ']) {
      expect(
        existingRelationshipHold({ handle, displayName: null })
      ).toMatchObject({
        held: true,
        matchedBy: 'handle',
        reason:
          'Existing relationship: Tim has written on Dannic tracks via their management/publisher',
      });
    }
  });

  it('holds Dannic by a second handle on another platform', () => {
    expect(
      existingRelationshipHold({
        handle: 'some-linktree-slug',
        displayName: null,
        instagramHandle: '@djdannic',
      })
    ).toMatchObject({ held: true, matchedBy: 'handle' });
  });

  it('holds Dannic by name whatever the case or spacing', () => {
    for (const displayName of ['Dannic', 'DANNIC', '  dannic  ', 'D a n n i c'])
      expect(
        existingRelationshipHold({ handle: 'unrelated', displayName })
      ).toMatchObject({ held: true, matchedBy: 'name' });
  });

  it('holds every artist Tim has worked with through their teams', () => {
    for (const [handle, displayName] of [
      ['balibandits', null],
      ['x', 'Bali Bandits'],
      ['orjannilsen', null],
      ['x', 'Ørjan Nilsen'],
      ['x', 'orjan  nilsen'],
      ['tom.fall', null],
      ['x', 'Tom Fall'],
    ] as const)
      expect(
        existingRelationshipHold({ handle, displayName }),
        `${handle} / ${displayName}`
      ).toMatchObject({ held: true });
  });

  it('does not hold an unrelated artist', () => {
    expect(
      existingRelationshipHold({
        handle: 'novalane',
        displayName: 'Nova Lane',
        contactEmail: 'hello@novalane.example',
        bio: 'Producer from Leeds. New single out now.',
      })
    ).toBeNull();
    // A longer name that only contains a held name is a different artist.
    expect(
      existingRelationshipHold({
        handle: 'dannicole',
        displayName: 'Dan Nicole',
      })
    ).toBeNull();
    expect(
      existingRelationshipHold({ handle: '', displayName: null })
    ).toBeNull();
  });

  it('holds a contact email at a registered domain (test fixture)', () => {
    const input = { handle: 'novalane', displayName: 'Nova Lane' };
    expect(
      existingRelationshipHold(
        { ...input, contactEmail: 'Bookings@Fixture-Mgmt.example' },
        FIXTURE
      )
    ).toEqual({
      held: true,
      matchedBy: 'organization_domain',
      reason: VIA('Fixture Management'),
    });
    expect(
      existingRelationshipHold(
        { ...input, contactEmail: 'a@mail.fixture-mgmt.example' },
        FIXTURE
      )
    ).toMatchObject({ held: true });
    expect(
      existingRelationshipHold(
        { ...input, contactEmail: 'a@notfixture-mgmt.example' },
        FIXTURE
      )
    ).toBeNull();
    expect(
      existingRelationshipHold(
        { ...input, contactEmail: 'a@fixture-mgmt.example.org' },
        FIXTURE
      )
    ).toBeNull();
  });

  it('holds an artist whose contact email is at a registered organization', () => {
    for (const [domain, name] of [
      ['sortedmanagement.com', 'Sorted Management'],
      ['cloud9music.nl', 'Cloud 9 Music'],
      ['bigmgmt.com', 'Big MGMT'],
    ] as const)
      expect(
        existingRelationshipHold({
          handle: 'novalane',
          displayName: 'Nova Lane',
          contactEmail: `info@${domain}`,
        })
      ).toEqual({
        held: true,
        matchedBy: 'organization_domain',
        reason: VIA(name),
      });
  });

  it('holds an artist whose bio names a registered organization', () => {
    for (const [bio, name] of [
      ['Mgmt: Sorted Management', 'Sorted Management'],
      ['Published by CLOUD 9 MUSIC.', 'Cloud 9 Music'],
      ['publishing: cloud9 music', 'Cloud 9 Music'],
      ['Bookings via Big MGMT / worldwide', 'Big MGMT'],
    ] as const)
      expect(
        existingRelationshipHold({
          handle: 'novalane',
          displayName: 'Nova Lane',
          bio,
        }),
        bio
      ).toEqual({
        held: true,
        matchedBy: 'organization_name',
        reason: VIA(name),
      });
    // The domain printed in the bio counts as the organization too.
    expect(
      existingRelationshipHold({
        handle: 'novalane',
        displayName: 'Nova Lane',
        bio: 'Bookings: www.sortedmanagement.com',
      })
    ).toMatchObject({ held: true, matchedBy: 'organization_domain' });
    // Words that merely contain the name do not match.
    expect(
      existingRelationshipHold({
        handle: 'novalane',
        displayName: 'Nova Lane',
        bio: 'Unsorted management of my own chaos',
      })
    ).toBeNull();
  });

  it('holds an artist whose bio names a registered contact', () => {
    const contact = EXISTING_RELATIONSHIPS.contacts[0]?.name ?? '';
    expect(contact).not.toBe('');
    expect(
      existingRelationshipHold({
        handle: 'novalane',
        displayName: 'Nova Lane',
        bio: `Management: ${contact.toUpperCase()}`,
      })
    ).toEqual({
      held: true,
      matchedBy: 'contact_name',
      reason: VIA(contact),
    });
    expect(
      existingRelationshipHold(
        {
          handle: 'novalane',
          displayName: 'Nova Lane',
          bio: 'mgmt - fixture   contact',
        },
        FIXTURE
      )
    ).toMatchObject({ matchedBy: 'contact_name' });
  });

  it('does not hold an Armada artist, but tags the relationship', () => {
    const tag = "Relationship: Armada Music, Tim's vocalist deals";
    for (const input of [
      { contactEmail: 'promo@armadamusic.com' },
      { bio: 'Out now on Armada' },
      { bio: 'Signed to Armada Music' },
      { labels: ['Armada Trice', null] },
      { labels: ['armada music'] },
    ]) {
      const lead = { handle: 'novalane', displayName: 'Nova Lane', ...input };
      expect(existingRelationshipHold(lead)).toBeNull();
      expect(existingRelationshipNotes(lead)).toEqual([tag]);
    }
    expect(
      existingRelationshipNotes({
        handle: 'novalane',
        displayName: 'Nova Lane',
        bio: 'Commander of my own armadas',
        labels: ['Nova Records'],
      })
    ).toEqual([]);
  });

  it('never tags a block organization as a note', () => {
    expect(
      existingRelationshipNotes({
        handle: 'novalane',
        displayName: 'Nova Lane',
        contactEmail: 'info@sortedmanagement.com',
      })
    ).toEqual([]);
  });
});

describe('the checked-in registry', () => {
  it('carries no email address or phone number', () => {
    const text = JSON.stringify(EXISTING_RELATIONSHIPS).replaceAll(
      /"addedAt":"\d{4}-\d{2}-\d{2}"/g,
      ''
    );
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
  });

  it('gives every entry a reason or kind, and a date', () => {
    for (const artist of EXISTING_RELATIONSHIPS.artists) {
      expect(artist.reason).toMatch(/^Existing relationship/);
      expect(artist.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(artist.handles.length).toBeGreaterThan(0);
    }
    for (const organization of EXISTING_RELATIONSHIPS.organizations) {
      expect(['block', 'note']).toContain(organization.kind);
      expect(organization.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (organization.kind === 'note') expect(organization.note).toBeTruthy();
    }
    expect(
      EXISTING_RELATIONSHIPS.organizations
        .filter(organization => organization.kind === 'note')
        .map(organization => organization.name)
    ).toEqual(['Armada Music']);
  });

  it('normalizes handles and names to one key', () => {
    expect(normalizeRelationshipKey('@DJ_Dannic')).toBe('djdannic');
    expect(normalizeRelationshipKey('Ørjan Nilsen')).toBe('orjannilsen');
    expect(normalizeRelationshipKey(null)).toBe('');
  });
});
