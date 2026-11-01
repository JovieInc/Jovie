import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockCostsTable,
  mockGetAdminCosts,
  mockGetLastRefreshed,
  mockRequireAdminAccess,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockCostsTable: vi.fn(() => <div data-testid='admin-costs-table-probe' />),
  mockGetAdminCosts: vi.fn(),
  mockGetLastRefreshed: vi.fn(),
  mockRequireAdminAccess: vi.fn(),
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    description,
    testId,
  }: {
    children: ReactNode;
    title: string;
    description: string;
    testId: string;
  }) => (
    <section data-testid={testId} data-page-title={title}>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@/lib/admin/costs', () => ({
  getAdminCosts: mockGetAdminCosts,
  getCostsLastRefreshedAt: mockGetLastRefreshed,
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mockRequireAdminAccess,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/app/app/(shell)/admin/costs/CostsTable', () => ({
  CostsTable: mockCostsTable,
}));

describe('AdminCostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAccess.mockResolvedValue('user_admin');
    mockGetAdminCosts.mockResolvedValue([]);
    mockGetLastRefreshed.mockResolvedValue(null);
  });

  it('starts no cost reads before the admin access gate resolves', async () => {
    mockRequireAdminAccess.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    const { default: AdminCostsPage } = await import(
      '@/app/app/(shell)/admin/costs/page'
    );

    await expect(AdminCostsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockGetAdminCosts).not.toHaveBeenCalled();
    expect(mockGetLastRefreshed).not.toHaveBeenCalled();
    expect(mockCostsTable).not.toHaveBeenCalled();
  });
  it('keeps a step-up-locked admin from cost reads without rendering an empty state', async () => {
    mockRequireAdminAccess.mockRejectedValueOnce(
      new Error('PRIVACY_UNLOCK_REQUIRED')
    );

    const { default: AdminCostsPage } = await import(
      '@/app/app/(shell)/admin/costs/page'
    );

    await expect(AdminCostsPage()).rejects.toThrow('PRIVACY_UNLOCK_REQUIRED');
    expect(mockGetAdminCosts).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalledWith(
      'Admin costs page failed to load cost items',
      expect.anything(),
      expect.anything()
    );
    expect(mockCostsTable).not.toHaveBeenCalled();
  });

  it('shows unknown spend without rendering a zero total when cost loading fails', async () => {
    mockGetAdminCosts.mockRejectedValueOnce(new Error('cost loader failed'));

    const { default: AdminCostsPage } = await import(
      '@/app/app/(shell)/admin/costs/page'
    );

    render(await AdminCostsPage());

    expect(screen.getByTestId('admin-costs-page')).toBeInTheDocument();
    expect(screen.getByTestId('admin-costs-page')).toHaveAttribute(
      'data-page-title',
      'Costs'
    );
    expect(
      screen.queryByRole('heading', { name: 'Costs' })
    ).not.toBeInTheDocument();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Admin costs page failed to load cost items',
      expect.any(Error),
      expect.objectContaining({ route: 'admin/costs' })
    );
    expect(mockCostsTable).not.toHaveBeenCalled();
    expect(screen.getByText(/Spend is unknown, not zero/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
  it('retains successfully read items when only refresh metadata fails', async () => {
    const items = [{ label: 'Hosting', observed30dUsd: '12' }];
    mockGetAdminCosts.mockResolvedValue(items);
    mockGetLastRefreshed.mockRejectedValue(new Error('timeout'));
    const { default: Page } = await import(
      '@/app/app/(shell)/admin/costs/page'
    );
    render(await Page());
    expect(mockCostsTable).toHaveBeenCalledWith(
      expect.objectContaining({ items, lastRefreshedLabel: 'Unavailable' }),
      undefined
    );
    expect(
      screen.getByText(/source refresh time could not be read/)
    ).toBeInTheDocument();
  });

  it('keeps a successful empty read distinct from an unavailable source', async () => {
    mockGetLastRefreshed.mockResolvedValue(null);
    const { default: Page } = await import(
      '@/app/app/(shell)/admin/costs/page'
    );
    render(await Page());
    expect(mockCostsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [],
        lastRefreshedLabel: 'Not recorded',
      }),
      undefined
    );
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });
});
