import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAccess: vi.fn() }));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireAccess,
}));
vi.mock('@/components/features/admin/lists/OvieListWorkspace', () => ({
  OvieListWorkspace: () => null,
}));
vi.mock('@/components/features/admin/lists/OvieSmartViewWorkspace', () => ({
  OvieSmartViewWorkspace: () => null,
}));

import AdminListPage, {
  metadata as listMetadata,
} from '@/app/app/(shell)/admin/lists/[id]/page';
import AdminSmartViewPage, {
  metadata as viewMetadata,
} from '@/app/app/(shell)/admin/lists/views/[viewId]/page';

describe('Ovie list pages', () => {
  beforeEach(() => {
    mocks.requireAccess.mockReset();
  });

  it('gates the list page on admin access and passes the list id', async () => {
    const element = await AdminListPage({
      params: Promise.resolve({ id: 'collab' }),
    });
    expect(mocks.requireAccess).toHaveBeenCalledTimes(1);
    expect(element.props).toEqual({ listId: 'collab' });
    expect(listMetadata.robots).toBeDefined();
  });

  it('gates the smart view page and passes the view id', async () => {
    const element = await AdminSmartViewPage({
      params: Promise.resolve({ viewId: 'favorites' }),
    });
    expect(mocks.requireAccess).toHaveBeenCalledTimes(1);
    expect(element.props).toEqual({ viewId: 'favorites' });
    expect(viewMetadata.robots).toBeDefined();
  });

  it('renders nothing when admin access is denied', async () => {
    mocks.requireAccess.mockRejectedValue(new Error('denied'));
    await expect(
      AdminListPage({ params: Promise.resolve({ id: 'collab' }) })
    ).rejects.toThrow('denied');
  });
});
