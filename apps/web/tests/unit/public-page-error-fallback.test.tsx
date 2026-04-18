import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicPageErrorFallback } from '@/components/providers/PublicPageErrorFallback';

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

  it('renders the inline fallback copy and triggers refresh', () => {
    const refreshMock = vi.fn();

    render(
      <PublicPageErrorFallback
        error={Object.assign(new Error('boom'), { digest: 'abc123' })}
        context='LandingPage'
        onRefresh={refreshMock}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'Something Went Wrong',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Try refreshing the page.')).toBeInTheDocument();
    expect(screen.getByText('Error ID abc123')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
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
