import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardContactInput } from '@/types/contacts';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockGetCachedAuth,
  mockWithDbSessionTx,
  mockRevalidatePath,
  mockRevalidateTag,
  mockUnstableCache,
  mockNoStore,
  mockGetEntitlements,
  mockSanitizeContactInput,
  mockInvalidateProfileCache,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockWithDbSessionTx: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockUnstableCache: vi.fn(),
  mockNoStore: vi.fn(),
  mockGetEntitlements: vi.fn(),
  mockSanitizeContactInput: vi.fn(),
  mockInvalidateProfileCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('next/cache', () => ({
  unstable_cache: mockUnstableCache,
  unstable_noStore: mockNoStore,
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetEntitlements,
}));

vi.mock('@/lib/contacts/validation', () => ({
  sanitizeContactInput: mockSanitizeContactInput,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { SETTINGS_CONTACTS: '/app/settings/contacts' },
}));

// Mock drizzle-orm operators used in query building
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
  count: vi.fn(() => 'count'),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
}));

// Mock DB schema tables
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerkId' },
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
    sortOrder: 'creatorContacts.sortOrder',
    createdAt: 'creatorContacts.createdAt',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a fake DB row that mapContact expects. */
function fakeContactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact_1',
    creatorProfileId: 'prof_1',
    role: 'manager' as const,
    customLabel: null,
    personName: 'Jane Doe',
    companyName: 'Acme Inc',
    territories: ['US', 'UK'],
    email: 'jane@example.com',
    phone: '+1234567890',
    preferredChannel: 'email' as const,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A valid DashboardContactInput for creating a new contact. */
function validInput(
  overrides: Partial<DashboardContactInput> = {}
): DashboardContactInput {
  return {
    profileId: 'prof_1',
    role: 'management',
    personName: 'Jane Doe',
    companyName: 'Acme Inc',
    territories: ['US'],
    email: 'jane@example.com',
    phone: '+1234567890',
    preferredChannel: 'email',
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

/**
 * Make withDbSessionTx execute the operation callback with a fake tx object.
 * The fake tx simulates drizzle's chainable query builder.
 */
function setupTxMock(
  opts: {
    ownershipResult?: Record<string, unknown> | null;
    selectRows?: Record<string, unknown>[];
    insertReturning?: Record<string, unknown>[];
    updateReturning?: Record<string, unknown>[];
    countResult?: number;
    deleteResult?: unknown;
  } = {}
) {
  const {
    ownershipResult = {
      id: 'prof_1',
      username: 'janedoe',
      usernameNormalized: 'janedoe',
    },
    selectRows = [],
    insertReturning = [],
    updateReturning = [],
    deleteResult = undefined,
  } = opts;

  // Track call order so we can return different results for successive selects
  let selectCallIndex = 0;

  const fakeTx = {
    select: vi.fn().mockImplementation(() => {
      const idx = selectCallIndex++;
      // First select in assertProfileOwnership (innerJoin query)
      if (idx === 0) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue(ownershipResult ? [ownershipResult] : []),
              }),
            }),
            // For plain selects (no join) — e.g. fetchContactsCore
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(selectRows),
              limit: vi.fn().mockResolvedValue(selectRows),
            }),
          }),
        };
      }
      // Subsequent selects: contact existence check or count
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(selectRows),
            limit: vi.fn().mockResolvedValue(selectRows),
          }),
          orderBy: vi.fn().mockResolvedValue(selectRows),
        }),
      };
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updateReturning),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(deleteResult),
    }),
  };

  mockWithDbSessionTx.mockImplementation(async (operation: Function) => {
    return operation(fakeTx, 'user_123');
  });

  return fakeTx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('contacts/actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockInvalidateProfileCache.mockResolvedValue(undefined);

    // Default: unstable_cache just invokes the passed function immediately
    mockUnstableCache.mockImplementation((fn: Function) => fn);

    // Default: sanitizeContactInput returns input as-is
    mockSanitizeContactInput.mockImplementation(
      (input: DashboardContactInput) => input
    );
  });

  // -----------------------------------------------------------------------
  // getProfileContactsForOwner
  // -----------------------------------------------------------------------
  describe('getProfileContactsForOwner', () => {
    it('returns cached contacts for authenticated owner', async () => {
      const row = fakeContactRow();
      setupTxMock({ selectRows: [row] });

      // unstable_cache wraps the core function: mock it to invoke the fn
      mockUnstableCache.mockImplementation((fn: Function) => fn);

      const { getProfileContactsForOwner } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      const contacts = await getProfileContactsForOwner('prof_1');

      expect(contacts).toHaveLength(1);
      expect(contacts[0].id).toBe('contact_1');
      expect(contacts[0].email).toBe('jane@example.com');
    });

    it('throws Unauthorized when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { getProfileContactsForOwner } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(getProfileContactsForOwner('prof_1')).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('passes correct cache key and tags to unstable_cache', async () => {
      setupTxMock();
      mockUnstableCache.mockImplementation((fn: Function) => fn);

      const { getProfileContactsForOwner } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await getProfileContactsForOwner('prof_1');

      expect(mockUnstableCache).toHaveBeenCalledWith(
        expect.any(Function),
        ['contacts', 'user_123', 'prof_1'],
        expect.objectContaining({
          revalidate: 30,
          tags: ['contacts:user_123:prof_1'],
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // saveContact — create
  // -----------------------------------------------------------------------
  describe('saveContact — create new contact', () => {
    it('inserts a new contact when no id is provided', async () => {
      const input = validInput();
      const savedRow = fakeContactRow();
      const fakeTx = setupTxMock({ insertReturning: [savedRow] });

      // No entitlement limit
      mockGetEntitlements.mockResolvedValue({ contactsLimit: null });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      const result = await saveContact(input);

      expect(result.id).toBe('contact_1');
      expect(fakeTx.insert).toHaveBeenCalled();
      expect(mockNoStore).toHaveBeenCalled();
    });

    it('calls sanitizeContactInput before saving', async () => {
      const input = validInput();
      const sanitized = { ...input, personName: 'Sanitized Name' };
      mockSanitizeContactInput.mockReturnValue(sanitized);

      setupTxMock({ insertReturning: [fakeContactRow()] });
      mockGetEntitlements.mockResolvedValue({ contactsLimit: null });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await saveContact(input);

      expect(mockSanitizeContactInput).toHaveBeenCalledWith(input);
    });

    it('invalidates caches after successful save', async () => {
      const input = validInput();
      setupTxMock({ insertReturning: [fakeContactRow()] });
      mockGetEntitlements.mockResolvedValue({ contactsLimit: null });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await saveContact(input);

      // Profile cache invalidation inside the transaction
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('janedoe');

      // Tag and path invalidation after the transaction
      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'contacts:user_123:prof_1',
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/contacts');
    });
  });

  // -----------------------------------------------------------------------
  // saveContact — update
  // -----------------------------------------------------------------------
  describe('saveContact — update existing contact', () => {
    it('updates an existing contact when id is provided', async () => {
      const input = validInput({ id: 'contact_1' });
      const updatedRow = fakeContactRow({ personName: 'Updated Name' });

      // For update path: first select is ownership, second select is existence check
      const fakeTx = setupTxMock({
        selectRows: [{ id: 'contact_1' }],
        updateReturning: [updatedRow],
      });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      const result = await saveContact(input);

      expect(result.personName).toBe('Updated Name');
      expect(fakeTx.update).toHaveBeenCalled();
      // Should NOT check entitlements for updates
      expect(mockGetEntitlements).not.toHaveBeenCalled();
    });

    it('throws when updating a non-existent contact', async () => {
      const input = validInput({ id: 'nonexistent' });

      // Return empty for the existence check
      setupTxMock({ selectRows: [] });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(saveContact(input)).rejects.toThrow('Contact not found');
    });
  });

  // -----------------------------------------------------------------------
  // saveContact — plan limit enforcement
  // -----------------------------------------------------------------------
  describe('saveContact — plan limit enforcement', () => {
    it('throws ContactLimitError when contact limit is reached', async () => {
      const input = validInput();

      // Setup tx so count query returns the limit
      mockWithDbSessionTx.mockImplementation(async (operation: Function) => {
        let callIdx = 0;
        const fakeTx = {
          select: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) {
              // assertProfileOwnership
              return {
                from: vi.fn().mockReturnValue({
                  innerJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue([
                        {
                          id: 'prof_1',
                          username: 'janedoe',
                          usernameNormalized: 'janedoe',
                        },
                      ]),
                    }),
                  }),
                }),
              };
            }
            // count query
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ total: 5 }]),
              }),
            };
          }),
          insert: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        };
        return operation(fakeTx, 'user_123');
      });

      mockGetEntitlements.mockResolvedValue({ contactsLimit: 5 });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(saveContact(input)).rejects.toThrow('Contact limit reached');
    });

    it('allows insert when under the contact limit', async () => {
      const input = validInput();

      mockWithDbSessionTx.mockImplementation(async (operation: Function) => {
        let callIdx = 0;
        const fakeTx = {
          select: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) {
              return {
                from: vi.fn().mockReturnValue({
                  innerJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue([
                        {
                          id: 'prof_1',
                          username: 'janedoe',
                          usernameNormalized: 'janedoe',
                        },
                      ]),
                    }),
                  }),
                }),
              };
            }
            // count query — under limit
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ total: 2 }]),
              }),
            };
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([fakeContactRow()]),
            }),
          }),
          update: vi.fn(),
          delete: vi.fn(),
        };
        return operation(fakeTx, 'user_123');
      });

      mockGetEntitlements.mockResolvedValue({ contactsLimit: 5 });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      const result = await saveContact(input);
      expect(result.id).toBe('contact_1');
    });

    it('allows insert when entitlements are unavailable (billing down)', async () => {
      const input = validInput();

      mockGetEntitlements.mockRejectedValue(
        new Error('Billing service unavailable')
      );

      setupTxMock({ insertReturning: [fakeContactRow()] });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      // Should not throw — gracefully degrades when billing is down
      const result = await saveContact(input);
      expect(result.id).toBe('contact_1');
    });

    it('allows insert when contactsLimit is null (pro/unlimited plan)', async () => {
      const input = validInput();

      mockGetEntitlements.mockResolvedValue({ contactsLimit: null });
      setupTxMock({ insertReturning: [fakeContactRow()] });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      const result = await saveContact(input);
      expect(result.id).toBe('contact_1');
    });
  });

  // -----------------------------------------------------------------------
  // deleteContact
  // -----------------------------------------------------------------------
  describe('deleteContact', () => {
    it('deletes an owned contact', async () => {
      const fakeTx = setupTxMock({
        selectRows: [{ id: 'contact_1' }],
      });

      const { deleteContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await deleteContact('contact_1', 'prof_1');

      expect(fakeTx.delete).toHaveBeenCalled();
      expect(mockNoStore).toHaveBeenCalled();
    });

    it('throws when contact does not exist', async () => {
      setupTxMock({ selectRows: [] });

      const { deleteContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(deleteContact('nonexistent', 'prof_1')).rejects.toThrow(
        'Contact not found'
      );
    });

    it('throws Unauthorized when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { deleteContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(deleteContact('contact_1', 'prof_1')).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('invalidates caches after successful delete', async () => {
      setupTxMock({ selectRows: [{ id: 'contact_1' }] });

      const { deleteContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await deleteContact('contact_1', 'prof_1');

      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('janedoe');
      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'contacts:user_123:prof_1',
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/contacts');
    });
  });

  // -----------------------------------------------------------------------
  // Auth rejection across all actions
  // -----------------------------------------------------------------------
  describe('auth rejection for all actions', () => {
    it('saveContact rejects unauthenticated users', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(saveContact(validInput())).rejects.toThrow('Unauthorized');
    });
  });

  // -----------------------------------------------------------------------
  // Profile ownership verification
  // -----------------------------------------------------------------------
  describe('profile ownership verification', () => {
    it('saveContact throws when profile is not owned by the user', async () => {
      setupTxMock({ ownershipResult: null });
      mockGetEntitlements.mockResolvedValue({ contactsLimit: null });

      const { saveContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(saveContact(validInput())).rejects.toThrow(
        'Unauthorized to access this profile'
      );
    });

    it('deleteContact throws when profile is not owned by the user', async () => {
      setupTxMock({ ownershipResult: null });

      const { deleteContact } = await import(
        '@/app/(shell)/dashboard/contacts/actions'
      );

      await expect(deleteContact('contact_1', 'prof_1')).rejects.toThrow(
        'Unauthorized to access this profile'
      );
    });
  });
});
