import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { mockCaptureError, mockLoadRevenueLift, mockRequireAccess } = vi.hoisted(
  () => ({
    mockCaptureError: vi.fn(),
    mockLoadRevenueLift: vi.fn().mockRejectedValue(new Error('database down')),
    mockRequireAccess: vi.fn().mockResolvedValue('user_admin'),
  })
);

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
  }) => (
    <section data-testid={testId} data-page-title={title}>
      {children}
    </section>
  ),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mockRequireAccess,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/metrics/revenue-lift-dashboard', () => ({
  loadRevenueLiftDashboard: mockLoadRevenueLift,
}));
vi.mock('@/lib/seo/noindex-metadata', () => ({
  NOINDEX_ROBOTS: { index: false, follow: false },
}));

describe('AdminRevenueLiftPage', () => {
  it('uses the canonical error state while the shell owns the visible title', async () => {
    const { default: AdminRevenueLiftPage } = await import(
      '@/app/app/(shell)/admin/revenue-lift/page'
    );
    render(await AdminRevenueLiftPage());

    expect(screen.getByTestId('admin-revenue-lift-page')).toHaveAttribute(
      'data-page-title',
      'Revenue Lift'
    );
    expect(screen.queryByRole('heading', { name: 'Revenue Lift' })).toBeNull();
    expect(screen.getByTestId('admin-revenue-lift-error')).toHaveTextContent(
      'Could not load revenue-lift metrics.'
    );
    expect(screen.getByTestId('admin-revenue-lift-error')).toHaveTextContent(
      'Check server logs and workflow_run_outcomes availability.'
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Admin revenue-lift dashboard failed to load',
      expect.any(Error),
      { route: 'admin/revenue-lift' }
    );
  });
});
