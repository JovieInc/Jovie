import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';
import { DashboardErrorFallback } from './DashboardErrorFallback';

describe('DashboardErrorFallback', () => {
  it('follows the RecoveryState contract: one Try again action, digest behind disclosure', () => {
    const resetErrorBoundary = vi.fn();
    const error = Object.assign(new Error('The dashboard request timed out.'), {
      digest: 'dashboard-timeout',
    });

    render(
      <DashboardErrorFallback
        error={error}
        resetErrorBoundary={resetErrorBoundary}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Unable to Load Dashboard' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: RECOVERY_COPY.retryLabel })
    ).toBeInTheDocument();

    // Digest is support-path data: present only inside the opt-in disclosure.
    const digest = screen.getByText('Error ID: dashboard-timeout');
    const disclosure = digest.closest('details');
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute('open');
  });
});
