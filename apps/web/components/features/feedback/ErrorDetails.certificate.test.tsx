import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ErrorDetails } from './ErrorDetails';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/components/feedback', () => ({ toast: toastMock }));

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });
}

const digestError = () =>
  Object.assign(new Error('Request timed out'), { digest: 'dash-timeout' });

describe('ErrorDetails certificate', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  it('copies the details from the plain copy button and confirms it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { container } = render(
      <ErrorDetails error={digestError()} extraContext={{ Route: '/app' }} />
    );

    const copy = screen.getByRole('button', {
      name: 'Copy error details to clipboard',
    });
    expect(copy).toHaveAttribute('data-slot', 'plain-button');
    expect(copy).toHaveAttribute('type', 'button');

    await user.click(copy);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('Route: /app');
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Copied')
    );
    await expectNoA11yViolations(container);
  });

  it('reports a failed copy and a missing clipboard', async () => {
    const user = userEvent.setup();
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const { unmount } = render(<ErrorDetails error={digestError()} />);

    await user.click(
      screen.getByRole('button', { name: 'Copy error details to clipboard' })
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        'Failed to copy error details'
      )
    );
    unmount();

    setClipboard(undefined);
    render(<ErrorDetails error={digestError()} />);
    await user.click(
      screen.getByRole('button', { name: 'Copy error details to clipboard' })
    );
    expect(toastMock.error).toHaveBeenCalledWith('Clipboard not available');
  });

  it('shows a generated reference when there is no error', async () => {
    const { container } = render(<ErrorDetails />);

    expect(screen.getByText(/^Error ID: ref-/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the collapsed details to show a long message', async () => {
    const user = userEvent.setup();
    const message =
      'Failed to sync the release plan because the distributor returned an unexpected response';
    const { container } = render(
      <ErrorDetails error={new Error(message)} collapsible showMessage />
    );

    const details = screen.getByText('Error details').closest('details');
    expect(details).not.toHaveAttribute('open');
    await user.click(screen.getByText('Error details'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText(message)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
