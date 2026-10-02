import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flags: vi.fn(),
  audit: vi.fn(),
  auth: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.auth,
}));
vi.mock('@/lib/flags/admin-features.server', () => ({
  getFeatureFlagAdminRows: mocks.flags,
}));
vi.mock('@/lib/flags/audit-log.server', () => ({
  getFeatureFlagAuditEvents: mocks.audit,
}));
vi.mock('@/lib/flags/env-tier', () => ({ getFlagEnvTier: () => 'prod' }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/app/app/(shell)/admin/features/AdminFeaturesTable', () => ({
  AdminFeaturesTable: () => <div>Flag controls</div>,
}));
vi.mock('@/app/app/(shell)/admin/features/FeatureFlagAuditSection', () => ({
  FeatureFlagAuditSection: () => <div>Audit records</div>,
}));

import Page from '@/app/app/(shell)/admin/features/page';

describe('Admin features read failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue('admin');
    mocks.flags.mockResolvedValue([]);
    mocks.audit.mockResolvedValue([]);
  });
  it('withholds flag controls on failure but preserves independently read history', async () => {
    mocks.flags.mockRejectedValue(new Error('timeout'));
    render(await Page());
    expect(screen.queryByText('Flag controls')).not.toBeInTheDocument();
    expect(screen.getByText('Audit records')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('preserves flag controls when only audit history fails', async () => {
    mocks.audit.mockRejectedValue(new Error('unavailable'));
    render(await Page());
    expect(screen.getByText('Flag controls')).toBeInTheDocument();
    expect(screen.queryByText('Audit records')).not.toBeInTheDocument();
    expect(
      screen.getByText(/does not mean there are no recorded changes/)
    ).toBeInTheDocument();
  });
  it('does not read private sources after permission is denied', async () => {
    mocks.auth.mockRejectedValue(new Error('denied'));
    await expect(Page()).rejects.toThrow('denied');
    expect(mocks.flags).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
