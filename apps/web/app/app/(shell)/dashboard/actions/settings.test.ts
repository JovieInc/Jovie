import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSidebarCollapsed } from './settings';

const mock = vi.hoisted(() => ({
  userId: 'auth-user-1' as string | null,
  upsertValues: vi.fn(),
  upsertConflict: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  revalidateTag: mock.revalidateTag,
  updateTag: mock.updateTag,
  revalidatePath: mock.revalidatePath,
  refresh: mock.refresh,
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: mock.userId }),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSession: async (operation: (userId: string) => unknown) =>
    operation('app-user-1'),
}));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mock.upsertValues(values);
        return {
          onConflictDoUpdate: async (config: unknown) => {
            mock.upsertConflict(config);
          },
        };
      },
    }),
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mock.captureError }));

describe('setSidebarCollapsed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.userId = 'auth-user-1';
  });

  it('stores the preference without expiring any cache', async () => {
    await setSidebarCollapsed(true);

    expect(mock.upsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'app-user-1', sidebarCollapsed: true })
    );
    expect(mock.upsertConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ sidebarCollapsed: true }),
      })
    );
    // The sidebar cookie is the SSR source of truth. Expiring DASHBOARD_DATA
    // here re-rendered the whole shell on every toggle.
    expect(mock.revalidateTag).not.toHaveBeenCalled();
    expect(mock.updateTag).not.toHaveBeenCalled();
    expect(mock.revalidatePath).not.toHaveBeenCalled();
    expect(mock.refresh).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller without writing', async () => {
    mock.userId = null;

    await expect(setSidebarCollapsed(false)).rejects.toThrow('Unauthorized');

    expect(mock.upsertValues).not.toHaveBeenCalled();
    expect(mock.captureError).toHaveBeenCalledTimes(1);
  });
});
