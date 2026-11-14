import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { inspectRecoveryActions } from '@/tests/utils/recovery-actions';
import { PageErrorState } from './PageErrorState';

describe('PageErrorState', () => {
  it('keeps the initial fatal-error view to one retry action and collapsed details', async () => {
    const user = userEvent.setup();
    render(
      <PageErrorState
        title='Unable to Load Dashboard'
        message='Try again in a moment.'
        error={Object.assign(new Error('Request timed out'), {
          digest: 'dashboard-timeout',
        })}
      />
    );

    expect(screen.getByRole('alert')).toHaveClass('min-h-64');
    expect(
      screen.getByRole('heading', { name: 'Unable to Load Dashboard' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' })
    ).toBeInTheDocument();
    const summary = screen.getByText('Error details');
    const details = summary.closest('details');
    expect(document.querySelectorAll('details')).toHaveLength(1);
    expect(details).not.toHaveAttribute('open');
    expect(
      details?.querySelector('[aria-label="Copy error details to clipboard"]')
    ).not.toBeNull();
    expect(document.querySelector('.lucide-triangle-alert')).toBeNull();

    await user.click(summary);
    expect(details).toHaveAttribute('open');
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute('data-focus-treatment', 'underline-only');
    expect(summary).not.toHaveClass('focus-visible:ring-0');
  });

  it('uses the supplied retry handler', () => {
    const onRetry = vi.fn();
    render(
      <PageErrorState
        title='Unable to Load Dashboard'
        message='Try again in a moment.'
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('satisfies the one-action recovery contract', () => {
    const { container } = render(
      <PageErrorState
        title='Unable to Load Dashboard'
        message='Try again in a moment.'
        error={Object.assign(new Error('Request timed out.'), {
          digest: 'dashboard-timeout',
        })}
      />
    );

    const inspection = inspectRecoveryActions(container);
    expect(inspection.recoveryActionCount).toBe(1);
    expect(inspection.issues).toEqual([]);
  });

  it('keeps a repeated error message out of the diagnostic disclosure', () => {
    const longMessage =
      'Timed out while loading profile, audience, release, and analytics data.';
    render(
      <PageErrorState
        title='Unable to Load Dashboard'
        message={longMessage}
        error={new Error(longMessage)}
      />
    );

    const details = screen.getByText('Error details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getAllByText(longMessage)).toHaveLength(1);
    expect(details).not.toHaveTextContent(longMessage);
    expect(
      details?.querySelector('[aria-label="Copy error details to clipboard"]')
    ).not.toBeNull();
  });

  it('keeps a distinct diagnostic message in the disclosure', () => {
    render(
      <PageErrorState
        title='Unable to Load Dashboard'
        message='Try again in a moment.'
        error={new Error('Request timed out after 30 seconds.')}
      />
    );

    const details = screen.getByText('Error details').closest('details');
    expect(details).toHaveTextContent('Request timed out after 30 seconds.');
  });

  it.each([
    [
      'error with diagnostics',
      {
        title: 'Unable to Load Dashboard',
        message: 'Try again in a moment.',
        error: Object.assign(new Error('Request timed out after 30 seconds.'), {
          digest: 'dashboard-timeout',
        }),
      },
    ],
    [
      'message only',
      { message: 'Failed to load your workspace. Please refresh the page.' },
    ],
    [
      'long diagnostics',
      {
        message: 'Try again in a moment.',
        error: new Error(
          'The dashboard request exceeded its timeout while loading profile, audience, release, and analytics data. Please retry after checking your connection.'
        ),
      },
    ],
  ])('is axe-clean for the %s state', async (_label, props) => {
    const { container } = render(<PageErrorState {...props} />);

    expect(screen.getByRole('alert')).toHaveTextContent(props.message);
    expect(screen.getAllByRole('button')).not.toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps the recovery action and details right-to-left and axe-clean', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PageErrorState
          title='تعذر تحميل لوحة التحكم'
          message='حاول مرة أخرى بعد قليل.'
          actionLabel='إعادة المحاولة'
          onRetry={onRetry}
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('heading', { name: 'تعذر تحميل لوحة التحكم' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
