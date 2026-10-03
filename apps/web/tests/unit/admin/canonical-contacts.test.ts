import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TABLES = vi.hoisted(() => ({
  waitlistEntries: { __table: 'waitlist_entries' },
  leads: { __table: 'leads' },
  users: { __table: 'users' },
  creatorProfiles: { __table: 'creator_profiles' },
  contacts: { __table: 'contacts' },
  contactStageTransitions: { __table: 'contact_stage_transitions' },
}));

const state = vi.hoisted(() => ({
  rowsByTable: new Map<object, unknown[]>(),
  readsByTable: new Map<object, unknown[][]>(),
  inserts: [] as { table: object; values: unknown }[],
  updates: [] as { table: object; values: unknown }[],
  tableExists: true,
}));

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  doesTableExist: vi.fn(async () => state.tableExists),
  db: {
    select: () => ({
      from: (table: object) =>
        thenable(
          state.readsByTable.get(table)?.shift() ??
            state.rowsByTable.get(table) ??
            []
        ),
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
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: TABLES.waitlistEntries,
}));
vi.mock('@/lib/db/schema/leads', () => ({ leads: TABLES.leads }));
vi.mock('@/lib/db/schema/auth', () => ({ users: TABLES.users }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: TABLES.creatorProfiles,
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
import { getDeterministicTestBetterAuthUserId } from '@/lib/auth/dev-test-auth-identity';

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
}) {
  state.rowsByTable.set(TABLES.waitlistEntries, rows.waitlist ?? []);
  state.rowsByTable.set(TABLES.leads, rows.leads ?? []);
  state.rowsByTable.set(TABLES.users, rows.users ?? []);
  state.rowsByTable.set(TABLES.creatorProfiles, rows.profiles ?? []);
  state.rowsByTable.set(TABLES.contacts, rows.contacts ?? []);
  state.rowsByTable.set(TABLES.contactStageTransitions, rows.transitions ?? []);
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.readsByTable.clear();
  state.inserts.length = 0;
  state.updates.length = 0;
  state.tableExists = true;
});

describe('canonical contacts read model (JOV-6888)', () => {
  it('recognizes explicitly provisioned Better Auth test identity on an external mailbox', async () => {
    const email = 'ordinary@artist-label.co';
    seed({
      users: [
        userRow({
          email,
          betterAuthUserId: getDeterministicTestBetterAuthUserId(email),
          userStatus: 'active',
        }),
      ],
    });
    expect((await getCanonicalContacts()).metrics.total).toBe(0);
  });

  it('resolves older linked QA owners outside the source window', async () => {
    seed({
      profiles: [
        profileRow({ userId: 'old-qa', usernameNormalized: 'recent-profile' }),
      ],
    });
    state.readsByTable.set(TABLES.users, [
      [],
      [userRow({ id: 'old-qa', email: 'old@test.jovie.com' })],
    ]);
    expect((await getCanonicalContacts()).total).toBe(0);
  });

  it('resolves older linked QA waitlist identities outside the source window', async () => {
    seed({
      profiles: [
        profileRow({
          waitlistEntryId: 'old-qa',
          usernameNormalized: 'recent-profile',
        }),
      ],
    });
    state.readsByTable.set(TABLES.waitlistEntries, [
      [],
      [waitlistRow({ id: 'old-qa', emailNormalized: 'old@test.jovie.com' })],
    ]);
    expect((await getCanonicalContacts()).metrics.total).toBe(0);
  });

  it('excludes an identity corrected to a known test domain', async () => {
    seed({
      users: [
        userRow({ email: 'artist@artist-label.co', userStatus: 'active' }),
      ],
      contacts: [
        {
          dedupeKey: 'email:artist@artist-label.co',
          emailNormalized: 'qa@test.jovie.com',
          stage: 'paying',
        },
      ],
    });
    expect((await getCanonicalContacts()).metrics.total).toBe(0);
  });
  it('excludes QA and linked alternate identities before list, metrics and exact lookup', async () => {
    seed({
      users: [
        userRow({
          id: 'qa-owner',
          email: 'owner@test.jovie.com',
          userStatus: 'active',
        }),
        userRow({
          id: 'real-owner',
          email: 'dogfood@artist-label.co',
          userStatus: 'active',
        }),
      ],
      profiles: [
        profileRow({
          id: 'qa-profile',
          userId: 'qa-owner',
          usernameNormalized: 'qa-profile',
          claimedAt: NOW,
        }),
      ],
      leads: [
        leadRow({
          id: 'qa-lead',
          creatorProfileId: 'qa-profile',
          contactEmail: 'alternate@artist-label.co',
          handle: 'alternate',
          paidAt: NOW,
        }),
      ],
      waitlist: [
        waitlistRow({
          emailNormalized: 'owner@test.jovie.com',
          status: 'approved',
        }),
      ],
      contacts: [
        {
          dedupeKey: 'email:owner@test.jovie.com',
          emailNormalized: 'renamed@artist-label.co',
          stage: 'paying',
        },
      ],
    });
    const result = await getCanonicalContacts();
    expect(result.contacts.map(row => row.email)).toEqual([
      'dogfood@artist-label.co',
    ]);
    expect(result.metrics.total).toBe(1);
    expect(result.metrics.paying).toBe(0);
    expect((await getCanonicalContacts({ search: 'alternate' })).total).toBe(0);
    expect(
      await getCanonicalContactByKey('email:alternate@artist-label.co')
    ).toBeNull();
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('does not infer test status from external names, missing email or entitlement grants', async () => {
    seed({
      users: [
        userRow({
          id: 'real',
          email: 'demo@artist-label.co',
          name: 'QA Dogfood',
          isPro: true,
          userStatus: 'active',
        }),
      ],
      profiles: [
        profileRow({
          id: 'unclassified',
          usernameNormalized: 'fixture-public',
          displayName: 'Test Person',
        }),
      ],
    });
    const result = await getCanonicalContacts();
    expect(result.total).toBe(2);
    expect(result.metrics.total).toBe(2);
    expect(result.metrics.paying).toBe(0);
  });
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
          contactEmail: 'grace@customer-label.co',
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
          emailNormalized: 'alan@customer-label.co',
          status: 'waitlisted',
          waitlistedAt: NOW,
        }),
      ],
      contacts: [
        {
          dedupeKey: 'email:alan@customer-label.co',
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
          email: 'newer@customer-label.co',
          userStatus: 'active',
          createdAt: new Date('2026-09-02T00:00:00Z'),
          updatedAt: new Date('2026-09-03T00:00:00Z'),
        }),
        userRow({
          id: 'u2',
          name: 'Older Person',
          email: 'older@customer-label.co',
          userStatus: 'active',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
    });

    const pageOne = await getCanonicalContacts({ page: 1, pageSize: 1 });
    expect(pageOne.total).toBe(2);
    expect(pageOne.contacts[0].email).toBe('newer@customer-label.co');

    const searched = await getCanonicalContacts({ search: 'older' });
    expect(searched.total).toBe(1);
    expect(searched.contacts[0].email).toBe('older@customer-label.co');

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
          emailNormalized: 'solo@customer-label.co',
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
      dedupeKey: 'email:new@customer-label.co',
      toStage: 'certified',
      actorUserId: 'admin-1',
      actorType: 'founder',
      reason: 'manual review',
      identity: {
        displayName: 'New',
        emailNormalized: 'new@customer-label.co',
      },
    });
    expect(result).toEqual({ ok: true, stage: 'certified' });
    expect(
      state.inserts.find(i => i.table === TABLES.contacts)?.values
    ).toMatchObject({
      dedupeKey: 'email:new@customer-label.co',
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
