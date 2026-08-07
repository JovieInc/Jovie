import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
      details?.querySelector('[aria-label="Copy Error Details To Clipboard"]')
    ).not.toBeNull();
    expect(document.querySelector('.lucide-triangle-alert')).toBeNull();

    await user.click(summary);
    expect(details).toHaveAttribute('open');
    expect(summary).not.toHaveFocus();
    expect(summary).toHaveAttribute('data-focus-treatment', 'underline-only');
    expect(summary).not.toHaveClass('focus-visible:ring-0');

    summary.focus();
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute('data-focus-treatment', 'underline-only');
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
      details?.querySelector('[aria-label="Copy Error Details To Clipboard"]')
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
});
