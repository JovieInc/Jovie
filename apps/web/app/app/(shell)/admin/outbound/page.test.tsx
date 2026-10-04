import { describe, expect, it, vi } from 'vitest';

const { mockRequireAccess } = vi.hoisted(() => ({
  mockRequireAccess: vi.fn(),
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mockRequireAccess,
}));
vi.mock('@/components/features/admin/outbound/OutboundWorkspace', () => ({
  OutboundWorkspace: () => null,
}));

import { OutboundWorkspace } from '@/components/features/admin/outbound/OutboundWorkspace';
import AdminOutboundPage, { metadata } from './page';

describe('/app/ov/outbound', () => {
  it('requires founder admin access before rendering the workspace', async () => {
    const element = await AdminOutboundPage();
    expect(mockRequireAccess).toHaveBeenCalledOnce();
    expect(element.type).toBe(OutboundWorkspace);
  });

  it('is never indexed', () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
