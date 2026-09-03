import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicPageErrorFallback } from './PublicPageErrorFallback';

const captureErrorInSentryMock = vi.fn();

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: (...args: unknown[]) =>
    captureErrorInSentryMock(...args),
}));

describe('PublicPageErrorFallback', () => {
  const consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);

  beforeEach(() => {
    captureErrorInSentryMock.mockReset();
    consoleErrorSpy.mockClear();
  });

  it('keeps the public-page recovery view to one action and collapsed details', async () => {
    const user = userEvent.setup();
    const refreshMock = vi.fn();

    render(
      <PublicPageErrorFallback
        error={Object.assign(new Error('boom'), { digest: 'abc123' })}
        context='LandingPage'
        onRefresh={refreshMock}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' })
    ).toBeInTheDocument();
    expect(screen.getByText('Try refreshing the page.')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Try again' })
    ).toBeInTheDocument();

    // Diagnostic digest stays behind the opt-in disclosure, never the
    // default tree.
    const digest = screen.getByText('Error ID: abc123');
    const disclosure = digest.closest('details');
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('omits the diagnostic disclosure when the error carries no digest', () => {
    render(
      <PublicPageErrorFallback error={new Error('boom')} context='Profile' />
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
    expect(document.querySelector('details')).not.toHaveAttribute('open');
  });

  it('logs the error and forwards it to Sentry capture when mounted', () => {
    const error = Object.assign(new Error('render failed'), {
      digest: 'digest-1',
    });

    render(<PublicPageErrorFallback error={error} context='Profile' />);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Profile Error]', error);
    expect(captureErrorInSentryMock).toHaveBeenCalledWith(error, 'Profile', {
      digest: 'digest-1',
    });
  });
});
