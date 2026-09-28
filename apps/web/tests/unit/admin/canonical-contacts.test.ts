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

const state = vi.hoisted(() => {
  return {
    rowsByTable: new Map<object, unknown[]>(),
    inserts: [] as { table: object; values: unknown }[],
    updates: [] as { table: object; set: unknown }[],
    tableExists: true,
  };
});

function rowsFor(table: object): unknown[] {
  return state.rowsByTable.get(table) ?? [];
}

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
    select: () => ({ from: (table: object) => thenable(rowsFor(table)) }),
    update: (table: object) => ({
      set: (values: unknown) => ({
        where: () => {
          state.updates.push({ table, set: values });
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: object) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        return {
          returning: () => Promise.resolve([{ id: 'contact-new' }]),
          then: (resolve: (value: unknown) => unknown) => resolve(values),
        };
      },
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
  getCanonicalContactMetrics,
  getCanonicalContacts,
  getContactStageTimeline,
  setCanonicalContactStage,
} from '@/lib/admin/contacts';

function seed({
  waitlist = [],
  leads = [],
  users = [],
  profiles = [],
  contacts = [],
  transitions = [],
}: {
  waitlist?: unknown[];
  leads?: unknown[];
  users?: unknown[];
  profiles?: unknown[];
  contacts?: unknown[];
  transitions?: unknown[];
}) {
  state.rowsByTable.set(TABLES.waitlistEntries, waitlist);
  state.rowsByTable.set(TABLES.leads, leads);
  state.rowsByTable.set(TABLES.users, users);
  state.rowsByTable.set(TABLES.creatorProfiles, profiles);
  state.rowsByTable.set(TABLES.contacts, contacts);
  state.rowsByTable.set(TABLES.contactStageTransitions, transitions);
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.inserts.length = 0;
  state.updates.length = 0;
  state.tableExists = true;
});

describe('canonical contacts read model (JOV-6888)', () => {
  it('merges sources by dedupe key and reports one funnel of metrics', async () => {
    const now = new Date('2026-09-28T00:00:00Z');
    seed({
      waitlist: [
        {
          id: 'w1',
          fullName: 'Ada Lovelace',
          emailNormalized: 'ada@example.com',
          status: 'approved',
          socialUrl: 'instagram.com/ada',
          approvedAt: now,
          invitedAt: null,
          signedUpAt: null,
          waitlistedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
      users: [
        {
          id: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          userStatus: 'active',
          isPro: true,
          plan: 'pro',
          stripeSubscriptionId: 'sub_1',
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      profiles: [
        {
          id: 'p1',
          userId: 'u1',
          waitlistEntryId: 'w1',
          usernameNormalized: 'ada',
          displayName: 'Ada',
          avatarUrl: null,
          isVerified: true,
          claimedAt: now,
          dmSentAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
      leads: [
        {
          id: 'l1',
          displayName: 'Grace Hopper',
          contactEmail: 'grace@example.com',
          linktreeHandle: 'grace',
          status: 'new',
          outreachStatus: 'sent',
          avatarUrl: null,
          creatorProfileId: null,
          signupUserId: null,
          approvedAt: null,
          ingestedAt: now,
          firstContactedAt: now,
          signupAt: null,
          paidAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const result = await getCanonicalContacts({ pageSize: 50 });

    // waitlist + user + profile share the ada@example.com dedupe key.
    expect(result.total).toBe(2);
    const ada = result.contacts.find(c => c.email === 'ada@example.com');
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
        {
          id: 'w1',
          fullName: 'Alan',
          emailNormalized: 'alan@example.com',
          status: 'waitlisted',
          socialUrl: null,
          approvedAt: null,
          invitedAt: null,
          signedUpAt: null,
          waitlistedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      contacts: [
        {
          dedupeKey: 'email:alan@example.com',
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
        {
          id: 'u1',
          name: 'Newer Person',
          email: 'newer@example.com',
          userStatus: 'active',
          isPro: false,
          plan: null,
          stripeSubscriptionId: null,
          deletedAt: null,
          createdAt: new Date('2026-09-02T00:00:00Z'),
          updatedAt: new Date('2026-09-03T00:00:00Z'),
        },
        {
          id: 'u2',
          name: 'Older Person',
          email: 'older@example.com',
          userStatus: 'active',
          isPro: false,
          plan: null,
          stripeSubscriptionId: null,
          deletedAt: null,
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    });

    const pageOne = await getCanonicalContacts({ page: 1, pageSize: 1 });
    expect(pageOne.total).toBe(2);
    expect(pageOne.contacts[0].email).toBe('newer@example.com');

    const searched = await getCanonicalContacts({ search: 'older' });
    expect(searched.total).toBe(1);
    expect(searched.contacts[0].email).toBe('older@example.com');

    const filtered = await getCanonicalContacts({ stage: 'paying' });
    expect(filtered.total).toBe(0);
    expect(filtered.metrics.total).toBe(2);
  });

  it('fails soft with empty result when source reads throw', async () => {
    state.tableExists = false; // contacts table missing
    seed({
      waitlist: [
        {
          id: 'w1',
          fullName: 'Solo',
          emailNormalized: 'solo@example.com',
          status: 'waitlisted',
          socialUrl: null,
          approvedAt: null,
          invitedAt: null,
          signedUpAt: null,
          waitlistedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
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
      dedupeKey: 'email:new@example.com',
      toStage: 'approved',
      actorUserId: 'admin-1',
      actorType: 'founder',
      reason: 'manual review',
      identity: {
        displayName: 'New Person',
        emailNormalized: 'new@example.com',
      },
    });

    expect(result).toEqual({ ok: true, stage: 'approved' });
    const contactInsert = state.inserts.find(i => i.table === TABLES.contacts);
    expect(contactInsert).toBeDefined();
    const transitionInsert = state.inserts.find(
      i => i.table === TABLES.contactStageTransitions
    );
    expect(transitionInsert!.values).toMatchObject({
      contactId: 'contact-new',
      dedupeKey: 'email:new@example.com',
      fromStage: null,
      toStage: 'approved',
      actorType: 'founder',
      actorId: 'admin-1',
      source: 'admin_contacts',
      reason: 'manual review',
    });
  });

  it('updates an existing contact and stamps certifiedAt on certify', async () => {
    seed({
      contacts: [
        {
          id: 'contact-1',
          dedupeKey: 'email:ex@example.com',
          stage: 'approved',
          certifiedAt: null,
          certifiedByUserId: null,
          displayName: 'Ex',
          emailNormalized: 'ex@example.com',
        },
      ],
    });

    const result = await setCanonicalContactStage({
      dedupeKey: 'email:ex@example.com',
      toStage: 'certified',
      actorUserId: 'founder-9',
    });

    expect(result).toEqual({ ok: true, stage: 'certified' });
    const update = state.updates.find(u => u.table === TABLES.contacts);
    expect(update!.set).toMatchObject({
      stage: 'certified',
      stageSource: 'founder',
      certifiedByUserId: 'founder-9',
    });
    expect((update!.set as { certifiedAt: Date }).certifiedAt).toBeInstanceOf(
      Date
    );
    const transition = state.inserts.find(
      i => i.table === TABLES.contactStageTransitions
    );
    expect(transition!.values).toMatchObject({
      contactId: 'contact-1',
      fromStage: 'approved',
      toStage: 'certified',
    });
  });

  it('returns ok:false when the contacts table does not exist', async () => {
    state.tableExists = false;
    const result = await setCanonicalContactStage({
      dedupeKey: 'email:x@example.com',
      toStage: 'churned',
    });
    expect(result).toEqual({ ok: false });
    expect(state.inserts).toHaveLength(0);
  });
});

describe('getContactStageTimeline', () => {
  it('returns ordered transition history items', async () => {
    seed({
      transitions: [
        {
          id: 't2',
          dedupeKey: 'email:a@example.com',
          fromStage: 'approved',
          toStage: 'certified',
          actorType: 'founder',
          actorId: 'f1',
          source: 'admin_contacts',
          reason: 'verified',
          createdAt: new Date('2026-09-02T00:00:00Z'),
        },
      ],
    });

    const timeline = await getContactStageTimeline('email:a@example.com');
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      id: 't2',
      fromStage: 'approved',
      toStage: 'certified',
      reason: 'verified',
    });
  });

  it('returns empty when the transitions table does not exist', async () => {
    state.tableExists = false;
    expect(await getContactStageTimeline('email:a@example.com')).toEqual([]);
  });
});
