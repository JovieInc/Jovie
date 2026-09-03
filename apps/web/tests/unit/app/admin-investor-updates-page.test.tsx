import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InvestorUpdateWorkflowError } from '@/lib/investors/update-contract';

const { mockCaptureError, mockLoadState, mockRequireAccess } = vi.hoisted(
  () => ({
    mockCaptureError: vi.fn(),
    mockLoadState: vi.fn(),
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
vi.mock('@/lib/investors/update-store', () => ({
  loadInvestorUpdateReviewState: mockLoadState,
}));

describe('InvestorUpdatesPage', () => {
  it('keeps the admin shell and shows a reserved error state when review load fails', async () => {
    mockLoadState.mockRejectedValueOnce(
      new InvestorUpdateWorkflowError(
        'candidate_invalid',
        'Invalid investor update candidate.'
      )
    );
    const { default: InvestorUpdatesPage } = await import(
      '@/app/app/(shell)/admin/investors/updates/page'
    );
    render(await InvestorUpdatesPage());

    expect(screen.getByTestId('admin-investor-updates-page')).toHaveAttribute(
      'data-page-title',
      'Investor updates'
    );
    expect(
      screen.queryByRole('heading', { name: 'Investor updates' })
    ).toBeNull();
    expect(
      screen.getByTestId('admin-investor-updates-error')
    ).toHaveTextContent('Could not load investor updates.');
    expect(
      screen.getByTestId('admin-investor-updates-error')
    ).toHaveTextContent('Invalid investor update candidate.');
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Admin investor-updates page failed to load',
      expect.any(InvestorUpdateWorkflowError),
      { route: 'admin/investors/updates' }
    );
  });
});
