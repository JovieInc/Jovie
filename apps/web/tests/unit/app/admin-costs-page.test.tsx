import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockCostsTable,
  mockGetAdminCosts,
  mockGetLastRefreshed,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockCostsTable: vi.fn(() => <div data-testid='admin-costs-table-probe' />),
  mockGetAdminCosts: vi.fn(),
  mockGetLastRefreshed: vi.fn(),
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
    <section data-testid={testId}>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@/lib/admin/costs', () => ({
  getAdminCosts: mockGetAdminCosts,
  getCostsLastRefreshedAt: mockGetLastRefreshed,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/app/app/(shell)/admin/costs/CostsTable', () => ({
  CostsTable: mockCostsTable,
}));

describe('AdminCostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminCosts.mockResolvedValue([]);
    mockGetLastRefreshed.mockResolvedValue(null);
  });

  it('renders the costs table with empty fallback data when optional loaders fail', async () => {
    mockGetAdminCosts.mockRejectedValueOnce(new Error('cost loader failed'));

    const { default: AdminCostsPage } = await import(
      '@/app/app/(shell)/admin/costs/page'
    );

    render(await AdminCostsPage());

    expect(screen.getByTestId('admin-costs-page')).toBeInTheDocument();
    expect(screen.getByText('Costs')).toBeInTheDocument();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Admin costs page failed to load optional data',
      expect.any(Error),
      expect.objectContaining({ route: 'admin/costs' })
    );
    expect(mockCostsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [],
        lastRefreshedLabel: 'Not recorded',
      }),
      undefined
    );
  });
});
