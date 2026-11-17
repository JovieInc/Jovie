import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureErrorInSentry } from '@/lib/errors/capture';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import ErrorBoundary from './ErrorBoundary';

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: vi.fn(),
}));

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.mocked(captureErrorInSentry).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the error, shows the recovery card and retries, axe-clean', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    const error = Object.assign(new Error('Request timed out'), {
      digest: 'abc123',
    });
    const { container } = render(
      <ErrorBoundary error={error} reset={reset} context='Dashboard' />
    );

    expect(captureErrorInSentry).toHaveBeenCalledWith(error, 'dashboard', {
      digest: 'abc123',
    });
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' })
    ).toBeVisible();
    expect(
      screen.getByText(
        "We couldn't load this page. Give it another try, or head home."
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows a caller message and an error without a digest, axe-clean', async () => {
    const { container } = render(
      <ErrorBoundary
        error={new Error('Releases failed')}
        reset={vi.fn()}
        context='Releases'
        message='Your releases could not load.'
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your releases could not load.'
    );
    expect(captureErrorInSentry).toHaveBeenCalledWith(
      expect.any(Error),
      'releases',
      { digest: undefined }
    );
    await expectNoA11yViolations(container);
  });

  it('asks for a reload after a deployment skew and skips Sentry, axe-clean', async () => {
    const reset = vi.fn();
    const { container } = render(
      <ErrorBoundary
        error={new Error('Failed to find server action. Refresh.')}
        reset={reset}
        context='Global'
      />
    );

    expect(screen.getByRole('heading', { name: 'App updated' })).toBeVisible();
    expect(
      screen.getByText('The app was just updated. Reload to continue.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Try again' })
    ).not.toBeInTheDocument();
    expect(captureErrorInSentry).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left messages axe-clean', async () => {
    const message = 'تعذر تحميل هذه الصفحة. '.repeat(10).trim();
    const { container } = render(
      <div dir='rtl'>
        <ErrorBoundary
          error={new Error('x')}
          reset={vi.fn()}
          context='Dashboard'
          message={message}
        />
      </div>
    );

    expect(screen.getByText(message)).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
