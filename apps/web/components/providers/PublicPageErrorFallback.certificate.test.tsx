import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicPageErrorFallback } from './PublicPageErrorFallback';

const captureErrorInSentryMock = vi.fn();

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: (...args: unknown[]) =>
    captureErrorInSentryMock(...args),
}));

describe('PublicPageErrorFallback certificate', () => {
  beforeEach(() => {
    captureErrorInSentryMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('announces the error, refreshes on retry and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { container } = render(
      <PublicPageErrorFallback
        error={Object.assign(new Error('boom'), {
          digest: 'public-page-timeout',
        })}
        context='LandingPage'
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    await user.click(screen.getByText('Error details'));
    expect(screen.getByText('Error ID: public-page-timeout')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(captureErrorInSentryMock).toHaveBeenCalledWith(
      expect.any(Error),
      'LandingPage',
      { digest: 'public-page-timeout' }
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean without a digest and in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicPageErrorFallback error={new Error('boom')} context='Profile' />
      </div>
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelector('details')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
