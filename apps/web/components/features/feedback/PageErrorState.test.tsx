import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PageErrorState } from './PageErrorState';

describe('PageErrorState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

    expect(screen.getByTestId('page-error-state')).toHaveClass('min-h-64');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-labelledby',
      expect.stringMatching(/^_r_/)
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Unable to Load Dashboard',
      })
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

  it('preserves a contextual accessible action label without changing visible copy', () => {
    render(
      <PageErrorState
        message='The conversation failed to load.'
        actionLabel='Reload'
        actionAriaLabel='Reload Chat'
        onRetry={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Reload Chat' })
    ).toHaveTextContent('Reload');
  });

  it('uses browser reload as the default recovery behavior', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    render(<PageErrorState message='The route failed to load.' />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('has no automated accessibility violations in its collapsed recovery state', async () => {
    const { container } = render(
      <PageErrorState
        message='The route failed to load.'
        error={new Error('Network request failed')}
        onRetry={vi.fn()}
      />
    );

    await expectNoA11yViolations(container);
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
