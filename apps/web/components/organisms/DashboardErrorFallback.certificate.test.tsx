import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardErrorFallback } from './DashboardErrorFallback';

describe('DashboardErrorFallback certificate', () => {
  it('shows the caught message axe-clean and retries the boundary', async () => {
    const resetErrorBoundary = vi.fn();
    const user = userEvent.setup();
    const error = Object.assign(new Error('The dashboard request timed out.'), {
      digest: 'dashboard-timeout',
    });
    const { container } = render(
      <DashboardErrorFallback
        error={error}
        resetErrorBoundary={resetErrorBoundary}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The dashboard request timed out.'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default copy for an empty message, axe-clean', async () => {
    const { container } = render(
      <DashboardErrorFallback
        error={new Error('')}
        resetErrorBoundary={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        'An unexpected error occurred while loading your dashboard.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the error details disclosure axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DashboardErrorFallback
        error={Object.assign(new TypeError('Failed to fetch'), {
          digest: 'net-1',
        })}
        resetErrorBoundary={vi.fn()}
      />
    );

    const digest = screen.getByText('Error ID: net-1');
    const disclosure = digest.closest('details');
    expect(disclosure).not.toHaveAttribute('open');
    await user.click(disclosure?.querySelector('summary') as HTMLElement);
    expect(disclosure).toHaveAttribute('open');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with a long message inside a right-to-left document', async () => {
    const message = 'انتهت مهلة طلب لوحة التحكم. '.repeat(8).trim();
    const { container } = render(
      <div dir='rtl'>
        <DashboardErrorFallback
          error={new Error(message)}
          resetErrorBoundary={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
