import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '@/constants/domains';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CopyToClipboardButton } from './CopyToClipboardButton';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => notifications,
}));

const writeText = vi.fn<(text: string) => Promise<void>>();
const originalExecCommand = document.execCommand;

// userEvent.setup() installs its own clipboard, so stub ours after it.
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return user;
}

beforeEach(() => {
  writeText.mockReset();
  notifications.success.mockReset();
  notifications.error.mockReset();
  vi.mocked(track).mockClear();
});

afterEach(() => {
  document.execCommand = originalExecCommand;
});

describe('CopyToClipboardButton', () => {
  it('copies the absolute profile URL and reports success', async () => {
    const user = setup();
    writeText.mockResolvedValue(undefined);
    const onCopySuccess = vi.fn();
    const { container } = render(
      <CopyToClipboardButton
        relativePath='/ada'
        onCopySuccess={onCopySuccess}
      />
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Copy URL' }));

    await waitFor(() => expect(onCopySuccess).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(`${BASE_URL}/ada`);
    await expectNoA11yViolations(container);
  });

  it('shows the pending state while the clipboard write is in flight', async () => {
    const user = setup();
    writeText.mockReturnValue(new Promise<void>(() => {}));
    const { container } = render(<CopyToClipboardButton relativePath='/ada' />);

    await user.click(screen.getByRole('button', { name: 'Copy URL' }));

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    );
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'pending');
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    await expectNoA11yViolations(container);
  });

  it('reports a refused clipboard through onCopyError', async () => {
    const user = setup();
    writeText.mockRejectedValue(new Error('blocked'));
    document.execCommand = vi.fn(() => false);
    const onCopyError = vi.fn();
    const { container } = render(
      <CopyToClipboardButton relativePath='/ada' onCopyError={onCopyError} />
    );

    await user.click(screen.getByRole('button', { name: 'Copy URL' }));

    await waitFor(() => expect(onCopyError).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAccessibleName(/Failed to copy/)
    );
    await expectNoA11yViolations(container);
  });

  it('tracks and toasts on the icon-only variant by default', async () => {
    const user = setup();
    writeText.mockResolvedValue(undefined);
    const { container } = render(
      <CopyToClipboardButton relativePath='/ada' iconName='Copy' />
    );

    await user.click(screen.getByRole('button', { name: 'Copy URL' }));

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
        status: 'success',
      })
    );
    expect(notifications.success).toHaveBeenCalledWith('Link copied', {
      duration: 2000,
    });
    expect(container.querySelector('output')).toHaveTextContent('Link copied');
    await expectNoA11yViolations(container);
  });

  it('tracks and toasts a default failure on the icon-only variant', async () => {
    const user = setup();
    writeText.mockRejectedValue(new Error('blocked'));
    document.execCommand = vi.fn(() => false);
    const { container } = render(
      <CopyToClipboardButton relativePath='/ada' iconName='Copy' />
    );

    await user.click(screen.getByRole('button', { name: 'Copy URL' }));

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('profile_copy_url_click', {
        status: 'error',
      })
    );
    expect(notifications.error).toHaveBeenCalledWith('Failed to copy');
    expect(container.querySelector('output')).toHaveTextContent(
      'Failed to copy profile URL'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left labels accessible', async () => {
    const label = 'Copy your public profile link to share it anywhere';
    const { container, unmount } = render(
      <CopyToClipboardButton relativePath='/ada' idleLabel={label} />
    );
    expect(screen.getByRole('button', { name: label })).toBeVisible();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl'>
        <CopyToClipboardButton relativePath='/ada' idleLabel='نسخ الرابط' />
      </div>
    );
    expect(screen.getByRole('button', { name: 'نسخ الرابط' })).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
