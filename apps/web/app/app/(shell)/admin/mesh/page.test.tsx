import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAccess: vi.fn() }));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireAccess,
}));
vi.mock('@/components/features/admin/mesh/MeshWorkspace', () => ({
  MeshWorkspace: () => null,
}));

import AdminMeshPage, {
  metadata as meshMetadata,
} from '@/app/app/(shell)/admin/mesh/page';

describe('Ovie mesh page', () => {
  beforeEach(() => {
    mocks.requireAccess.mockReset();
  });

  it('gates the page on admin access before rendering', async () => {
    const element = await AdminMeshPage({});
    expect(mocks.requireAccess).toHaveBeenCalledTimes(1);
    expect(element.type).not.toBeNull();
    expect(meshMetadata.robots).toBeDefined();
  });

  it('refuses to render when admin access is denied', async () => {
    mocks.requireAccess.mockRejectedValue(new Error('denied'));
    await expect(AdminMeshPage({})).rejects.toThrow('denied');
  });
});
