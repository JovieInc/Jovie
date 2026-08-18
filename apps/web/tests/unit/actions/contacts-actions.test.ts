import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardContact, DashboardContactInput } from '@/types/contacts';

const mocked = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  withDbSessionTx: vi.fn(),
  getEntitlements: vi.fn(),
  getDashboardContacts: vi.fn(),
  invalidateProfileCache: vi.fn(),
  revalidateTag: vi.fn(),
  noStore: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocked.getCachedAuth,
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mocked.withDbSessionTx,
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocked.getEntitlements,
}));
vi.mock('@/lib/contacts/queries', () => ({
  getDashboardContacts: mocked.getDashboardContacts,
}));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mocked.invalidateProfileCache,
}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  unstable_noStore: mocked.noStore,
  revalidateTag: mocked.revalidateTag,
}));
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => [left, right],
  notInArray: (left: unknown, right: unknown) => [left, right],
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id' },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
  },
  creatorContacts: {
    id: 'creatorContacts.id',
    creatorProfileId: 'creatorContacts.creatorProfileId',
  },
  creatorContactPeople: {
    id: 'creatorContactPeople.id',
    creatorProfileId: 'creatorContactPeople.creatorProfileId',
    displayName: 'creatorContactPeople.displayName',
    companyName: 'creatorContactPeople.companyName',
    email: 'creatorContactPeople.email',
    phone: 'creatorContactPeople.phone',
    preferredChannel: 'creatorContactPeople.preferredChannel',
  },
  creatorContactResponsibilities: {
    id: 'creatorContactResponsibilities.id',
    creatorProfileId: 'creatorContactResponsibilities.creatorProfileId',
    role: 'creatorContactResponsibilities.role',
    customLabel: 'creatorContactResponsibilities.customLabel',
  },
  creatorContactAssignments: {
    personId: 'creatorContactAssignments.personId',
    responsibilityId: 'creatorContactAssignments.responsibilityId',
  },
}));

const profile = {
  id: 'profile-1',
  username: 'artist',
  usernameNormalized: 'artist',
};

const savedContact: DashboardContact = {
  id: 'person-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Alex Agent',
  companyName: 'Agency',
  territories: ['Worldwide'],
  email: 'alex@example.com',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
  responsibilities: [
    {
      id: 'assignment-management',
      role: 'management',
      customLabel: null,
      territories: ['Worldwide'],
      isActive: true,
      isPrimary: true,
      sortOrder: 0,
    },
    {
      id: 'assignment-bookings',
      role: 'bookings',
      customLabel: null,
      territories: ['Europe'],
      isActive: true,
      isPrimary: false,
      sortOrder: 1,
    },
  ],
};

function validInput(
  overrides: Partial<DashboardContactInput> = {}
): DashboardContactInput {
  return {
    profileId: 'profile-1',
    role: 'management',
    personName: 'Alex Agent',
    companyName: 'Agency',
    territories: ['Worldwide'],
    email: 'alex@example.com',
    phone: null,
    preferredChannel: 'email',
    responsibilities: [
      {
        role: 'management',
        territories: ['Worldwide'],
        isPrimary: true,
        sortOrder: 0,
      },
      {
        role: 'bookings',
        territories: ['Europe'],
        sortOrder: 1,
      },
    ],
    ...overrides,
  };
}

function awaitableRows(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function transactionForCreate(count = 0) {
  let selectIndex = 0;
  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'person-1' }]),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  const tx = {
    select: vi.fn().mockImplementation(() => {
      const index = selectIndex++;
      if (index === 0) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue(awaitableRows([profile])),
            }),
          }),
        };
      }
      const rows =
        index === 1
          ? [{ count }]
          : index === 2
            ? []
            : [
                {
                  id: 'responsibility-management',
                  role: 'management',
                  customLabel: '',
                },
                {
                  id: 'responsibility-bookings',
                  role: 'bookings',
                  customLabel: '',
                },
              ];
      return {
        from: vi
          .fn()
          .mockReturnValue({ where: vi.fn(() => awaitableRows(rows)) }),
      };
    }),
    insert,
    update: vi.fn().mockReturnValue({
      set: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
  mocked.withDbSessionTx.mockImplementation(operation =>
    operation(tx, 'user-1')
  );
  return tx;
}

function transactionForDelete(personExists: boolean) {
  let selectIndex = 0;
  const remove = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const tx = {
    select: vi.fn().mockImplementation(() => {
      const index = selectIndex++;
      const rows =
        index === 0 ? [profile] : personExists ? [{ id: 'person-1' }] : [];
      const query = awaitableRows(rows);
      return {
        from: vi.fn().mockReturnValue(
          index === 0
            ? {
                innerJoin: vi
                  .fn()
                  .mockReturnValue({ where: vi.fn(() => query) }),
              }
            : { where: vi.fn(() => query) }
        ),
      };
    }),
    delete: remove,
  };
  mocked.withDbSessionTx.mockImplementation(operation =>
    operation(tx, 'user-1')
  );
  return { tx, remove };
}

describe('contacts actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocked.getEntitlements.mockResolvedValue({ contactsLimit: null });
    mocked.getDashboardContacts.mockResolvedValue([savedContact]);
    mocked.invalidateProfileCache.mockResolvedValue(undefined);
  });

  it('persists one person with multiple reusable responsibility assignments', async () => {
    const tx = transactionForCreate();
    const { saveContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(saveContact(validInput())).resolves.toEqual(savedContact);

    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(mocked.getDashboardContacts).toHaveBeenCalledWith(tx, 'profile-1');
    expect(mocked.revalidateTag).toHaveBeenCalledWith(
      'contacts:user-1:profile-1',
      'max'
    );
    expect(mocked.invalidateProfileCache).toHaveBeenCalledWith('artist');
  });

  it('enforces the person limit before any directory write', async () => {
    const tx = transactionForCreate(1);
    mocked.getEntitlements.mockResolvedValue({ contactsLimit: 1 });
    const { saveContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(saveContact(validInput())).rejects.toThrow(
      'Contact limit reached'
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('degrades safely when entitlement lookup is unavailable', async () => {
    transactionForCreate();
    mocked.getEntitlements.mockRejectedValue(new Error('billing unavailable'));
    const { saveContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(saveContact(validInput())).resolves.toEqual(savedContact);
  });

  it('does not retire unseen assignments from an older single-role client', async () => {
    const tx = transactionForCreate();
    const { saveContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(
      saveContact(validInput({ responsibilities: undefined }))
    ).resolves.toEqual(savedContact);

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('requires an authenticated owner', async () => {
    mocked.getCachedAuth.mockResolvedValue({ userId: null });
    const { saveContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(saveContact(validInput())).rejects.toThrow('Unauthorized');
  });

  it('deletes only an owned directory person and invalidates both caches', async () => {
    const { remove } = transactionForDelete(true);
    const { deleteContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(
      deleteContact('person-1', 'profile-1')
    ).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledTimes(2);
    expect(mocked.revalidateTag).toHaveBeenCalledWith(
      'contacts:user-1:profile-1',
      'max'
    );
    expect(mocked.invalidateProfileCache).toHaveBeenCalledWith('artist');
  });

  it('rejects deletion of a person outside the directory', async () => {
    transactionForDelete(false);
    const { deleteContact } = await import(
      '@/app/(shell)/dashboard/contacts/actions'
    );

    await expect(deleteContact('missing', 'profile-1')).rejects.toThrow(
      'Contact not found'
    );
  });
});
