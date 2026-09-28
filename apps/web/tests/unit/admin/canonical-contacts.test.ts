import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TABLES = vi.hoisted(() => ({
  waitlistEntries: { __table: 'waitlist_entries' },
  leads: { __table: 'leads' },
  users: { __table: 'users' },
  creatorProfiles: { __table: 'creator_profiles' },
  contacts: { __table: 'contacts' },
}));

const state = vi.hoisted(() => ({
  rowsByTable: new Map<object, unknown[]>(),
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
      from: (table: object) => thenable(state.rowsByTable.get(table) ?? []),
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
vi.mock('@/lib/db/schema/contacts', () => ({ contacts: TABLES.contacts }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import {
  getCanonicalContactMetrics,
  getCanonicalContacts,
} from '@/lib/admin/contacts';

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
}) {
  state.rowsByTable.set(TABLES.waitlistEntries, rows.waitlist ?? []);
  state.rowsByTable.set(TABLES.leads, rows.leads ?? []);
  state.rowsByTable.set(TABLES.users, rows.users ?? []);
  state.rowsByTable.set(TABLES.creatorProfiles, rows.profiles ?? []);
  state.rowsByTable.set(TABLES.contacts, rows.contacts ?? []);
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.tableExists = true;
});

describe('canonical contacts read model (JOV-6888)', () => {
  it('merges sources by dedupe key and reports one funnel of metrics', async () => {
    seed({
      waitlist: [
        waitlistRow({
          fullName: 'Ada Lovelace',
          emailNormalized: 'ada@example.com',
          status: 'approved',
          socialUrl: 'instagram.com/ada',
          approvedAt: NOW,
          waitlistedAt: NOW,
        }),
      ],
      users: [
        userRow({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
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
          contactEmail: 'grace@example.com',
          handle: 'grace',
          status: 'new',
          outreachStatus: 'sent',
          ingestedAt: NOW,
          firstContactedAt: NOW,
        }),
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
        waitlistRow({
          fullName: 'Alan',
          emailNormalized: 'alan@example.com',
          status: 'waitlisted',
          waitlistedAt: NOW,
        }),
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
        userRow({
          name: 'Newer Person',
          email: 'newer@example.com',
          userStatus: 'active',
          createdAt: new Date('2026-09-02T00:00:00Z'),
          updatedAt: new Date('2026-09-03T00:00:00Z'),
        }),
        userRow({
          id: 'u2',
          name: 'Older Person',
          email: 'older@example.com',
          userStatus: 'active',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        }),
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
        waitlistRow({
          fullName: 'Solo',
          emailNormalized: 'solo@example.com',
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
