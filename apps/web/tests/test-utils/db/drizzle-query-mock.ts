/**
 * Drizzle Query Mock Utilities
 *
 * Provides reusable mock factories for Drizzle ORM query chains.
 * Reduces boilerplate in tests that need to mock database operations.
 *
 * @example
 * ```ts
 * import { createDrizzleMocks, createTransactionMock } from '@/tests/test-utils/db/drizzle-query-mock';
 *
 * const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbTransaction } = createDrizzleMocks();
 *
 * vi.mock('@/lib/db', () => ({
 *   db: {
 *     select: mockDbSelect,
 *     insert: mockDbInsert,
 *     update: mockDbUpdate,
 *     transaction: mockDbTransaction,
 *   },
 * }));
 * ```
 */
import { vi } from 'vitest';

export type MockFn = ReturnType<typeof vi.fn>;

/**
 * Creates a chainable select mock that follows Drizzle's pattern:
 * db.select().from().where().limit()
 *
 * @param resolvedValue - The value to resolve when the chain completes
 */
export function createSelectChain(resolvedValue: unknown[] = []) {
  const mockLimit = vi.fn().mockResolvedValue(resolvedValue);
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockWhere = vi.fn().mockReturnValue({
    limit: mockLimit,
    orderBy: mockOrderBy,
  });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    mockSelect,
    mockFrom,
    mockWhere,
    mockOrderBy,
    mockLimit,
    // Helper to change resolved value dynamically
    setResolvedValue: (value: unknown[]) => {
      mockLimit.mockResolvedValue(value);
    },
  };
}

/**
 * Creates a chainable insert mock that follows Drizzle's pattern:
 * db.insert().values().returning() or db.insert().values().onConflictDoUpdate()
 *
 * @param returnValue - The value to return from .returning()
 */
export function createInsertChain(
  returnValue: unknown[] = [{ id: 'mock-id' }]
) {
  const mockReturning = vi.fn().mockResolvedValue(returnValue);
  const mockOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockReturnValue({
    returning: mockReturning,
    onConflictDoUpdate: mockOnConflict,
  });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  return {
    mockInsert,
    mockValues,
    mockReturning,
    mockOnConflict,
    // Helper to change return value dynamically
    setReturnValue: (value: unknown[]) => {
      mockReturning.mockResolvedValue(value);
    },
  };
}

/**
 * Creates a chainable update mock that follows Drizzle's pattern:
 * db.update().set().where()
 */
export function createUpdateChain() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  return {
    mockUpdate,
    mockSet,
    mockWhere,
  };
}

/**
 * Creates a chainable delete mock that follows Drizzle's pattern:
 * db.delete().where()
 */
export function createDeleteChain() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });

  return {
    mockDelete,
    mockWhere,
  };
}

export interface DrizzleMocks {
  mockDbSelect: MockFn;
  mockDbInsert: MockFn;
  mockDbUpdate: MockFn;
  mockDbDelete: MockFn;
  mockDbExecute: MockFn;
  mockDbTransaction: MockFn;
  // Chain helpers for more control
  selectChain: ReturnType<typeof createSelectChain>;
  insertChain: ReturnType<typeof createInsertChain>;
  updateChain: ReturnType<typeof createUpdateChain>;
  deleteChain: ReturnType<typeof createDeleteChain>;
}

/**
 * Creates all standard Drizzle mock functions with vi.hoisted() compatible format.
 * Use this in the test file's top-level scope.
 *
 * @example
 * ```ts
 * const mocks = vi.hoisted(() => createDrizzleMocksHoisted());
 *
 * vi.mock('@/lib/db', () => ({
 *   db: {
 *     select: mocks.mockDbSelect,
 *     insert: mocks.mockDbInsert,
 *     update: mocks.mockDbUpdate,
 *     execute: mocks.mockDbExecute,
 *     transaction: mocks.mockDbTransaction,
 *   },
 * }));
 * ```
 */
export function createDrizzleMocksHoisted() {
  const selectChain = createSelectChain();
  const insertChain = createInsertChain();
  const updateChain = createUpdateChain();
  const deleteChain = createDeleteChain();

  return {
    mockDbSelect: selectChain.mockSelect,
    mockDbInsert: insertChain.mockInsert,
    mockDbUpdate: updateChain.mockUpdate,
    mockDbDelete: deleteChain.mockDelete,
    mockDbExecute: vi.fn(),
    mockDbTransaction: vi.fn(),
    selectChain,
    insertChain,
    updateChain,
    deleteChain,
  };
}

export interface TransactionContext {
  select: MockFn;
  insert: MockFn;
  update: MockFn;
  execute: MockFn;
}

export interface TransactionMockOptions {
  /** Default select result for queries within the transaction */
  selectResult?: unknown[];
  /** Default insert return value */
  insertReturn?: unknown[];
  /** Whether to simulate an error in the transaction */
  shouldError?: boolean;
  /** Custom error to throw */
  error?: Error;
}

/**
 * Creates a transaction mock implementation that can be used with mockDbTransaction.
 * The transaction provides a context object with select, insert, update, execute methods.
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   mocks.mockDbTransaction.mockImplementation(
 *     createTransactionMock({ selectResult: [], insertReturn: [{ id: 'new-id' }] })
 *   );
 * });
 * ```
 */
export function createTransactionMock(options: TransactionMockOptions = {}) {
  const {
    selectResult = [],
    insertReturn = [{ id: 'mock-id' }],
    shouldError = false,
    error = new Error('Transaction failed'),
  } = options;

  return async <T>(
    callback: (tx: TransactionContext) => Promise<T>
  ): Promise<T> => {
    if (shouldError) {
      throw error;
    }

    const mockReturning = vi.fn().mockResolvedValue(insertReturn);
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({
      returning: mockReturning,
      onConflictDoUpdate: mockOnConflict,
    });
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(selectResult),
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const tx: TransactionContext = {
      select: vi.fn().mockReturnValue({ from: mockFrom }),
      insert: vi.fn().mockReturnValue({ values: mockValues }),
      update: vi.fn().mockReturnValue({ set: mockSet }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    return await callback(tx);
  };
}

/**
 * Helper to create the db mock object for vi.mock('@/lib/db', ...)
 */
export function createDbMock(
  mocks: ReturnType<typeof createDrizzleMocksHoisted>
) {
  return {
    db: {
      select: mocks.mockDbSelect,
      insert: mocks.mockDbInsert,
      update: mocks.mockDbUpdate,
      delete: mocks.mockDbDelete,
      execute: mocks.mockDbExecute,
      transaction: mocks.mockDbTransaction,
    },
  };
}
