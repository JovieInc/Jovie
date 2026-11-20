import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { InlineOfflineNotice } from './inline-offline';

describe('InlineOfflineNotice', () => {
  it('renders offline status with canonical selector', () => {
    render(<InlineOfflineNotice data-testid='offline-notice' />);

    const notice = screen.getByTestId('offline-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveAttribute('aria-atomic', 'true');
    expect(notice).toHaveAttribute('data-state', 'offline');
    expect(notice.className).toContain('text-app');
    expect(notice.className).toContain('border-warning/30');
    expect(notice.className).toContain('bg-warning-subtle');
    expect(notice).toHaveClass('text-warning-text');
  });

  it('does not bypass semantic warning tokens with arbitrary state variables', () => {
    render(<InlineOfflineNotice data-testid='offline-notice' />);

    const notice = screen.getByTestId('offline-notice');
    expect(notice.className).not.toMatch(/--state-offline-(border|bg|fg)/);
  });

  it('calls retry handler when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<InlineOfflineNotice onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical secondary retry action contract', () => {
    render(<InlineOfflineNotice onRetry={() => undefined} />);
    const retry = screen.getByRole('button', { name: 'Retry' });

    expect(retry).toHaveAttribute('data-variant', 'secondary');
    expect(retry).toHaveAttribute('data-size', 'sm');
    expect(retry).toHaveClass(
      'h-auto',
      'min-h-7',
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
    expect(retry).not.toHaveClass('before:h-11');
  });

  it('supports custom copy and omits the action without a handler', () => {
    render(
      <InlineOfflineNotice
        message='Offline — cached audience data is still available.'
        retryLabel='Try again'
      />
    );

    expect(
      screen.getByText('Offline — cached audience data is still available.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' })
    ).not.toBeInTheDocument();
  });
});

describe('InlineOfflineNotice layout', () => {
  it('aligns the message to the logical start edge for RTL copy', () => {
    render(
      <div dir='rtl'>
        <InlineOfflineNotice message='يبدو أنك غير متصل.' />
      </div>
    );

    const message = screen.getByText('يبدو أنك غير متصل.');
    expect(message).toHaveClass('text-start', 'min-w-0', 'flex-1');
    expect(message).not.toHaveClass('text-left');
  });

  it('wraps a long message and long retry label instead of overflowing', () => {
    render(
      <InlineOfflineNotice
        data-testid='offline-notice'
        message='You are offline. Cached analytics remain visible and pending edits sync later.'
        retryLabel='Reconnect and refresh'
        onRetry={() => undefined}
      />
    );

    expect(screen.getByTestId('offline-notice')).toHaveClass('flex-wrap');
    expect(
      screen.getByRole('button', { name: 'Reconnect and refresh' })
    ).toHaveClass('shrink-0');
  });
});

describe('InlineOfflineNotice accessibility', () => {
  it('has no axe violations with and without retry, long and RTL copy', async () => {
    const { container } = render(
      <div>
        <InlineOfflineNotice onRetry={() => undefined} />
        <InlineOfflineNotice message='Offline — showing cached audience stats.' />
        <InlineOfflineNotice
          message='You are offline. Cached analytics remain visible and pending edits sync later.'
          retryLabel='Reconnect and refresh'
          onRetry={() => undefined}
        />
        <div dir='rtl' lang='ar'>
          <InlineOfflineNotice
            message='يبدو أنك غير متصل.'
            retryLabel='إعادة المحاولة'
            onRetry={() => undefined}
          />
        </div>
      </div>
    );

    await expectNoA11yViolations(container);
  });
});
