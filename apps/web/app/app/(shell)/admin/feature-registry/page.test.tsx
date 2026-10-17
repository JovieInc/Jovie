import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OvieCertificationsWorkspace } from '@/components/features/admin/certifications/OvieCertificationsWorkspace';

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.access,
}));
vi.mock(
  '@/components/features/admin/certifications/OvieCertificationsWorkspace',
  () => ({ OvieCertificationsWorkspace: vi.fn(() => null) })
);

import FeatureRegistryPage from './page';

describe('Feature Registry compatibility route', () => {
  beforeEach(() => vi.resetAllMocks());
  it('opens the canonical certification table filtered to capabilities', async () => {
    const page = await FeatureRegistryPage();
    expect(mocks.access).toHaveBeenCalledOnce();
    expect(page.type).toBe(OvieCertificationsWorkspace);
    expect(page.props).toEqual({ initialDomain: 'feature_registry' });
  });
  it('checks admin access before rendering', async () => {
    mocks.access.mockRejectedValue(new Error('forbidden'));
    await expect(FeatureRegistryPage()).rejects.toThrow('forbidden');
  });
});
