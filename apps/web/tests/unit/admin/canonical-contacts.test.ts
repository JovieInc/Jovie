import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TABLES = vi.hoisted(() => ({
  waitlistEntries: { __table: 'waitlist_entries' },
  leads: { __table: 'leads' },
  users: { __table: 'users' },
  creatorProfiles: { __table: 'creator_profiles' },
  userProfileClaims: { __table: 'user_profile_claims' },
  contacts: { __table: 'contacts' },
  contactStageTransitions: { __table: 'contact_stage_transitions' },
}));

const state = vi.hoisted(() => ({
  rowsByTable: new Map<object, unknown[]>(),
  sourceRowsByTable: new Map<object, unknown[]>(),
  failedTable: null as object | null,
  inserts: [] as { table: object; values: unknown }[],
  updates: [] as { table: object; values: unknown }[],
  tableExists: true,
}));

function thenable(rows: unknown[], table?: object) {
  let selected =
    table === TABLES.userProfileClaims
      ? rows.filter(row => (row as { role: string }).role === 'owner')
      : rows;
  const chain: Record<string, unknown> = {
    where: () => chain,
    orderBy: () => chain,
    limit: () => {
      selected = state.sourceRowsByTable.get(table ?? {}) ?? selected;
      return chain;
    },
    then: (
      resolve: (value: unknown[]) => unknown,
      reject: (error: Error) => unknown
    ) =>
      state.failedTable === table
        ? reject(new Error('identity lookup unavailable'))
        : resolve(selected),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  doesTableExist: vi.fn(async () => state.tableExists),
  db: {
    select: () => ({
      from: (table: object) =>
        thenable(state.rowsByTable.get(table) ?? [], table),
    }),
    insert: (table: object) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        return {
          returning: async () => [{ id: 'contact-new' }],
          then: (resolve: (value: unknown) => unknown) => resolve(values),
        };
      },
    }),
    update: (table: object) => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push({ table, values });
        },
      }),
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  desc: vi.fn((column: unknown) => column),
  and: vi.fn(),
  or: vi.fn(),
  inArray: vi.fn(),
  ilike: vi.fn(),
  exists: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: TABLES.waitlistEntries,
}));
vi.mock('@/lib/db/schema/leads', () => ({ leads: TABLES.leads }));
vi.mock('@/lib/db/schema/auth', () => ({ users: TABLES.users }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: TABLES.creatorProfiles,
  userProfileClaims: TABLES.userProfileClaims,
}));
vi.mock('@/lib/db/schema/contacts', () => ({
  contacts: TABLES.contacts,
  contactStageTransitions: TABLES.contactStageTransitions,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import {
  getCanonicalContactByKey,
  getCanonicalContactMetrics,
  getCanonicalContacts,
  getContactStageTimeline,
  setCanonicalContactStage,
} from '@/lib/admin/contacts';
import {
  getCustomerPopulationExclusions,
  isNonCustomerUser,
} from '@/lib/admin/customer-population';
import { getDeterministicTestBetterAuthUserId } from '@/lib/auth/dev-test-auth-identity';
import { CONTACT_LIFECYCLE_STAGES } from '@/lib/contacts/lifecycle';

const NOW = new Date('2026-09-28T00:00:00Z');

// Unset fields read as undefined, which the source mappers treat like null.
const baseRow = { createdAt: NOW, updatedAt: NOW };
const waitlistRow = (o: Record<string, unknown>) => ({
  id: 'w1',
  ...baseRow,
  ...o,
});
const leadRow = (o: Record<string, unknown>) => ({
  id: 'l1',
  ...baseRow,
  ...o,
});
const userRow = (o: Record<string, unknown>) => ({
  id: 'u1',
  ...baseRow,
  ...o,
});
const profileRow = (o: Record<string, unknown>) => ({
  id: 'p1',
  ...baseRow,
  ...o,
});

function seed(rows: {
  waitlist?: unknown[];
  leads?: unknown[];
  users?: unknown[];
  profiles?: unknown[];
  contacts?: unknown[];
  transitions?: unknown[];
  claims?: unknown[];
}) {
  state.rowsByTable.set(TABLES.waitlistEntries, rows.waitlist ?? []);
  state.rowsByTable.set(TABLES.leads, rows.leads ?? []);
  state.rowsByTable.set(TABLES.users, rows.users ?? []);
  state.rowsByTable.set(TABLES.creatorProfiles, rows.profiles ?? []);
  state.rowsByTable.set(TABLES.contacts, rows.contacts ?? []);
  state.rowsByTable.set(TABLES.userProfileClaims, rows.claims ?? []);
  state.rowsByTable.set(TABLES.contactStageTransitions, rows.transitions ?? []);
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.sourceRowsByTable.clear();
  state.failedTable = null;
  state.inserts.length = 0;
  state.updates.length = 0;
  state.tableExists = true;
});

describe('canonical contacts read model (JOV-6888)', () => {
  it('merges sources by dedupe key and reports one funnel of metrics', async () => {
    seed({
      waitlist: [
        waitlistRow({
          fullName: 'Ada Lovelace',
          emailNormalized: 'ada@analytical-engine.co',
          status: 'approved',
          socialUrl: 'instagram.com/ada',
          approvedAt: NOW,
          waitlistedAt: NOW,
        }),
      ],
      users: [
        userRow({
          name: 'Ada Lovelace',
          email: 'ada@analytical-engine.co',
          userStatus: 'active',
          isPro: true,
          plan: 'pro',
          stripeSubscriptionId: 'sub_1',
        }),
      ],
      profiles: [
        profileRow({
          userId: 'u1',
          waitlistEntryId: 'w1',
          usernameNormalized: 'ada',
          displayName: 'Ada',
          isVerified: true,
          claimedAt: NOW,
          dmSentAt: NOW,
        }),
      ],
      leads: [
        leadRow({
          displayName: 'Grace Hopper',
          contactEmail: 'grace@artist-mail.com',
          handle: 'grace',
          status: 'new',
          outreachStatus: 'sent',
          ingestedAt: NOW,
          firstContactedAt: NOW,
        }),
      ],
    });

    const result = await getCanonicalContacts({ pageSize: 50 });

    // waitlist + user + profile share the ada@analytical-engine.co dedupe key.
    expect(result.total).toBe(2);
    const ada = result.contacts.find(
      c => c.email === 'ada@analytical-engine.co'
    );
    expect(ada).toBeDefined();
    expect(ada!.stage).toBe('paying');
    expect(ada!.sources).toContain('waitlist');
    expect(ada!.sources).toContain('user');
    expect(ada!.sources).toContain('profile');
    expect(result.metrics.paying).toBe(1);
    expect(result.metrics.total).toBe(2);
  });

  it('applies founder overrides only forward and marks certified contacts', async () => {
    seed({
      waitlist: [
        waitlistRow({
          fullName: 'Alan',
          emailNormalized: 'alan@artist-mail.com',
          status: 'waitlisted',
          waitlistedAt: NOW,
        }),
      ],
      contacts: [
        {
          dedupeKey: 'email:alan@artist-mail.com',
          stage: 'certified',
          certifiedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    });

    const { contacts } = await getCanonicalContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].stage).toBe('certified');
    expect(contacts[0].overrideStage).toBe('certified');
    expect(contacts[0].certifiedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(contacts[0].sources).toContain('contact');
  });

  it('filters by stage and search and paginates deterministically', async () => {
    seed({
      users: [
        userRow({
          name: 'Newer Person',
          email: 'newer@artist-mail.com',
          userStatus: 'active',
          createdAt: new Date('2026-09-02T00:00:00Z'),
          updatedAt: new Date('2026-09-03T00:00:00Z'),
        }),
        userRow({
          id: 'u2',
          name: 'Older Person',
          email: 'older@artist-mail.com',
          userStatus: 'active',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
    });

    const pageOne = await getCanonicalContacts({ page: 1, pageSize: 1 });
    expect(pageOne.total).toBe(2);
    expect(pageOne.contacts[0].email).toBe('newer@artist-mail.com');

    const searched = await getCanonicalContacts({ search: 'older' });
    expect(searched.total).toBe(1);
    expect(searched.contacts[0].email).toBe('older@artist-mail.com');

    const filtered = await getCanonicalContacts({ stage: 'paying' });
    expect(filtered.total).toBe(0);
    expect(filtered.metrics.total).toBe(2);
  });

  it('never counts dogfood or comped accounts as paying (Tim 2026-09-30)', async () => {
    seed({
      users: [
        userRow({
          id: 'u_founder',
          name: 'Founder',
          email: 'tim@jov.ie',
          userStatus: 'active',
          isPro: true,
          plan: 'pro',
          stripeSubscriptionId: 'sub_comp',
        }),
        userRow({
          id: 'u_comp',
          name: 'Comped Artist',
          email: 'artist@indie-label.co',
          userStatus: 'active',
          isPro: true,
          plan: 'pro',
          stripeSubscriptionId: null,
        }),
      ],
    });

    const result = await getCanonicalContacts({});

    expect(result.metrics.paying).toBe(0);
  });

  it('fails soft with empty result when source reads throw', async () => {
    state.tableExists = false; // contacts table missing
    seed({
      waitlist: [
        waitlistRow({
          fullName: 'Solo',
          emailNormalized: 'solo@artist-mail.com',
          status: 'waitlisted',
          waitlistedAt: NOW,
        }),
      ],
    });
    const metrics = await getCanonicalContactMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.suggested).toBe(1);
  });
});

describe('setCanonicalContactStage', () => {
  it('inserts a new contact and appends transition provenance', async () => {
    seed({});
    const result = await setCanonicalContactStage({
      dedupeKey: 'email:new@artist-mail.com',
      toStage: 'certified',
      actorUserId: 'admin-1',
      actorType: 'founder',
      reason: 'manual review',
      identity: { displayName: 'New', emailNormalized: 'new@artist-mail.com' },
    });
    expect(result).toEqual({ ok: true, stage: 'certified' });
    expect(
      state.inserts.find(i => i.table === TABLES.contacts)?.values
    ).toMatchObject({
      dedupeKey: 'email:new@artist-mail.com',
      stage: 'certified',
    });
    expect(
      state.inserts.find(i => i.table === TABLES.contactStageTransitions)
        ?.values
    ).toMatchObject({
      contactId: 'contact-new',
      fromStage: null,
      toStage: 'certified',
      actorId: 'admin-1',
      reason: 'manual review',
    });
  });

  it('updates an existing contact row and keeps prior certification', async () => {
    seed({
      contacts: [
        {
          id: 'c9',
          dedupeKey: 'k',
          stage: 'certified',
          certifiedAt: NOW,
          certifiedByUserId: 'f1',
        },
      ],
    });
    const result = await setCanonicalContactStage({
      dedupeKey: 'k',
      toStage: 'churned',
      actorUserId: 'f2',
    });
    expect(result).toEqual({ ok: true, stage: 'churned' });
    expect(state.updates[0]?.values).toMatchObject({
      stage: 'churned',
      certifiedAt: NOW,
      certifiedByUserId: 'f1',
    });
    expect(
      state.inserts.find(i => i.table === TABLES.contactStageTransitions)
        ?.values
    ).toMatchObject({ contactId: 'c9', fromStage: 'certified' });
  });

  it('returns ok:false when the contacts table is missing', async () => {
    state.tableExists = false;
    expect(
      await setCanonicalContactStage({ dedupeKey: 'k', toStage: 'approved' })
    ).toEqual({ ok: false });
    expect(state.inserts).toHaveLength(0);
  });
});

describe('getContactStageTimeline', () => {
  it('maps transition rows to timeline items', async () => {
    seed({
      transitions: [
        {
          id: 't1',
          fromStage: 'approved',
          toStage: 'certified',
          actorType: 'founder',
          actorId: 'f1',
          source: 'admin_contacts',
          reason: 'verified',
          createdAt: NOW,
        },
      ],
    });
    expect(await getContactStageTimeline('k')).toEqual([
      {
        id: 't1',
        fromStage: 'approved',
        toStage: 'certified',
        actorType: 'founder',
        actorId: 'f1',
        source: 'admin_contacts',
        reason: 'verified',
        createdAt: NOW,
      },
    ]);
  });

  it('returns empty when the transitions table is missing', async () => {
    state.tableExists = false;
    expect(await getContactStageTimeline('k')).toEqual([]);
  });
});

describe('customer population isolation (JOV-7395)', () => {
  it.each(CONTACT_LIFECYCLE_STAGES)(
    'excludes internal identities before %s overrides, counts, lookup and search',
    async stage => {
      seed({
        waitlist: [
          waitlistRow({
            emailNormalized: 'fixture@jov.ie',
            status: 'approved',
          }),
        ],
        users: [
          userRow({
            email: 'fixture@jov.ie',
            userStatus: 'active',
            stripeSubscriptionId: 'sub_fixture',
          }),
        ],
        profiles: [
          profileRow({
            userId: 'u1',
            waitlistEntryId: 'w1',
            usernameNormalized: 'synthetic-profile',
            isVerified: true,
            claimedAt: NOW,
          }),
        ],
        leads: [
          leadRow({
            signupUserId: 'u1',
            creatorProfileId: 'p1',
            handle: 'synthetic-lead',
            contactEmail: 'alias@artist-mail.com',
            paidAt: NOW,
          }),
        ],
        contacts: [
          {
            dedupeKey: 'email:fixture@jov.ie',
            stage,
            emailNormalized: 'renamed@artist-mail.com',
          },
        ],
      });
      const rawBefore = structuredClone([...state.rowsByTable.values()]);
      const result = await getCanonicalContacts({
        search: 'fixture',
        pageSize: 1,
      });
      expect(result).toMatchObject({
        contacts: [],
        total: 0,
        metrics: { total: 0 },
      });
      expect(Object.values(result.metrics).every(value => value === 0)).toBe(
        true
      );
      expect(await getCanonicalContactByKey('email:fixture@jov.ie')).toBeNull();
      expect([...state.rowsByTable.values()]).toEqual(rawBefore);
      expect([state.inserts, state.updates]).toEqual([[], []]);
    }
  );

  it('uses exact auth provisioning and reserved profiles, including graph edges outside the source scan', async () => {
    const fixtureEmail = 'ordinary-name@artist-mail.com';
    seed({
      users: [
        userRow({
          id: 'old-fixture',
          email: fixtureEmail,
          betterAuthUserId: getDeterministicTestBetterAuthUserId(fixtureEmail),
        }),
        userRow({
          id: 'real',
          email: 'demo@label.com',
          betterAuthUserId: '11111111-1111-8111-8111-111111111111',
          userStatus: 'active',
          stripeSubscriptionId: 'sub_real',
        }),
      ],
      waitlist: [waitlistRow({ emailNormalized: 'canary@example.com' })],
      profiles: [
        profileRow({
          id: 'auth-fixture',
          userId: null,
          usernameNormalized: 'ordinary-fixture',
        }),
        profileRow({ id: 'reserved', usernameNormalized: 'browse-ready-user' }),
        profileRow({
          id: 'waitlist-fixture',
          usernameNormalized: 'waitlist-fixture',
          waitlistEntryId: 'w1',
        }),
      ],
      claims: [
        {
          creatorProfileId: 'auth-fixture',
          userId: 'old-fixture',
          role: 'owner',
        },
      ],
      leads: [
        leadRow({ signupUserId: 'old-fixture', handle: 'outside-scan' }),
        leadRow({
          id: 'l2',
          creatorProfileId: 'auth-fixture',
          handle: 'linked-fixture',
        }),
        leadRow({
          id: 'l3',
          creatorProfileId: 'reserved',
          handle: 'linked-reserved',
        }),
      ],
    });
    state.sourceRowsByTable.set(TABLES.users, [
      state.rowsByTable.get(TABLES.users)![1],
    ]);
    state.sourceRowsByTable.set(TABLES.waitlistEntries, []);
    const result = await getCanonicalContacts({ pageSize: 1 });
    expect(result.contacts.map(row => row.email)).toEqual(['demo@label.com']);
    expect(result.metrics).toMatchObject({ total: 1, paying: 1 });
    expect(result.total).toBe(1);
    expect(isNonCustomerUser({ email: null, betterAuthUserId: null })).toBe(
      false
    );
  });

  it('preserves customers with internal managers/viewers and superseded legacy ownership', async () => {
    seed({
      users: [
        userRow({ id: 'internal', email: 'operator@jov.ie' }),
        userRow({
          id: 'real',
          email: 'artist-public@label.com',
          userStatus: 'active',
        }),
      ],
      profiles: [
        profileRow({
          userId: 'internal',
          usernameNormalized: 'real-artist',
          isVerified: true,
          claimedAt: NOW,
        }),
      ],
      claims: [
        { creatorProfileId: 'p1', userId: 'internal', role: 'manager' },
        { creatorProfileId: 'p1', userId: 'internal', role: 'viewer' },
        { creatorProfileId: 'p1', userId: 'real', role: 'owner' },
      ],
    });
    expect((await getCustomerPopulationExclusions()).profileIds.size).toBe(0);
    const result = await getCanonicalContacts({ search: 'real-artist' });
    expect(result.total).toBe(1);
    expect(result.contacts[0]).toMatchObject({
      userId: 'real',
      email: 'artist-public@label.com',
      creatorProfileId: 'p1',
    });
    expect(result.contacts[0].sources).toEqual(['profile', 'user']);
    expect(result.metrics.total).toBe(1);
  });

  it('keeps pagination, stages, metrics and caller overrides on the same eligible set', async () => {
    seed({
      users: [
        userRow({ email: 'fixture@example.net', userStatus: 'active' }),
        userRow({ id: 'u2', email: 'real@label.com', userStatus: 'active' }),
        userRow({ id: 'u3', email: 'second@label.com', userStatus: 'active' }),
      ],
    });
    const first = await getCanonicalContacts({ pageSize: 1 });
    const second = await getCanonicalContacts({
      page: 2,
      pageSize: 1,
      stage: first.contacts[0].stage,
    });
    expect([
      first.total,
      second.total,
      first.metrics.total,
      second.metrics.total,
    ]).toEqual([2, 2, 2, 2]);
    expect(first.contacts[0].email).not.toBe(second.contacts[0].email);
    seed({
      users: [userRow({ email: 'real@label.com' })],
      contacts: [
        {
          dedupeKey: 'email:real@label.com',
          stage: 'certified',
          emailNormalized: 'override@jov.ie',
        },
      ],
    });
    expect((await getCanonicalContacts()).metrics.total).toBe(0);
  });

  it('fails closed when provenance lookup fails and preserves strict outage reporting', async () => {
    seed({
      users: [userRow({ email: 'real@label.com' })],
      profiles: [profileRow({ usernameNormalized: 'real-artist' })],
    });
    state.failedTable = TABLES.userProfileClaims;
    expect((await getCanonicalContacts()).contacts).toEqual([]);
    await expect(getCanonicalContacts({ throwOnError: true })).rejects.toThrow(
      'identity lookup unavailable'
    );
  });
});
