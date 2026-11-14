import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('runs the recovery action and dismisses on request', async () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ErrorBanner
        title='Failed to save changes'
        description='Please check your connection and try again.'
        actions={[
          { label: 'Retry', onClick: onRetry },
          { label: 'Contact Support', href: '/support' },
        ]}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByRole('alert', { name: 'Error' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Contact Support' })
    ).toHaveAttribute('href', '/support');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows only the message and details toggle without actions', async () => {
    const { container } = render(
      <ErrorBanner title='Failed to load tasks' actions={[]} />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Dismiss error' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('reveals the digest and copies the error details', async () => {
    // userEvent.setup() installs its own clipboard; replace it afterwards.
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { container } = render(
      <ErrorBanner
        title='Something went wrong'
        error={Object.assign(new Error('Render failed'), {
          digest: 'a1b2c3d4',
        })}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Show error details' })
    );
    expect(screen.getByText('Error ID: a1b2c3d4')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Copy error details to clipboard' })
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Copied'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Error ID: a1b2c3d4')
    );

    await user.click(
      screen.getByRole('button', { name: 'Hide error details' })
    );
    expect(screen.queryByText('Error ID: a1b2c3d4')).toBeNull();
  });

  it('reports a failed copy', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
    });
    render(<ErrorBanner title='Something went wrong' />);
    await user.click(
      screen.getByRole('button', { name: 'Show error details' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Copy error details to clipboard' })
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to copy error details')
    );
  });

  it('renders a title with an action but no description', async () => {
    const { container } = render(
      <ErrorBanner
        title='Failed to save changes'
        actions={[{ label: 'Retry', onClick: vi.fn() }]}
      />
    );
    expect(screen.getByText('Failed to save changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and permission-denied copy whole and accessible', async () => {
    const description =
      'The server stopped responding before the last update finished. Your earlier edits are safe, but the most recent changes were not stored.';
    const { container, unmount } = render(
      <ErrorBanner
        title='We could not save the changes you made to your release plan and tour dates'
        description={description}
        actions={[{ label: 'Retry saving every change', onClick: vi.fn() }]}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(description)).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const denied = render(
      <ErrorBanner
        title="You don't have access to this workspace"
        actions={[{ label: 'Request access', onClick: vi.fn() }]}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Request access' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(denied.container);
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ErrorBanner
          title='تعذر حفظ التغييرات'
          description='يرجى التحقق من اتصالك والمحاولة مرة أخرى.'
          actions={[{ label: 'إعادة المحاولة', onClick: vi.fn() }]}
          onDismiss={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText('تعذر حفظ التغييرات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
