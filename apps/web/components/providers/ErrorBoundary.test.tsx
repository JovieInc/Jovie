import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ErrorBoundary } from './ErrorBoundary';

const { captureErrorInSentry, toastError } = vi.hoisted(() => ({
  captureErrorInSentry: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry,
  getUserFriendlyErrorMessage: () => 'Friendly message',
  isUserFacingError: () => true,
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: () => 'enabled',
  isSentryInitialized: () => true,
}));

vi.mock('@/components/feedback', () => ({
  toast: { error: toastError },
}));

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    captureErrorInSentry.mockClear();
    toastError.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', async () => {
    const { container } = render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('All good')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the default fallback, reports the error and toasts', async () => {
    const onError = vi.fn();
    const { container } = render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something Went Wrong');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(captureErrorInSentry).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(
      'Friendly message',
      expect.objectContaining({ duration: 6000 })
    );
    await expectNoA11yViolations(container);
  });

  it('skips the toast when showToast is false and uses a custom fallback', async () => {
    const { container } = render(
      <ErrorBoundary showToast={false} fallback={<p>Custom fallback</p>}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('reloads the page from the fallback button', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });

    render(
      <ErrorBoundary showToast={false}>
        <Boom />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole('button', { name: 'Reload page' }));

    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
