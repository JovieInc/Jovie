import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { RerunIngestionButton } from './RerunIngestionButton';

const refreshMock = vi.fn();
const rerunActionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/app/app/(shell)/admin/actions', () => ({
  rerunCustomerIngestionAction: (fd: FormData) => rerunActionMock(fd),
}));

const BUTTON = { name: 'Re-run Artist Ingestion' };

describe('RerunIngestionButton certificate', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    rerunActionMock.mockReset();
  });

  it('keeps the idle button axe-clean', async () => {
    const { container } = render(
      <RerunIngestionButton creatorProfileId='cp-1' />
    );
    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('disables the button while the request is pending', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    rerunActionMock.mockReturnValue(
      new Promise(resolve => {
        finish = () =>
          resolve({ state: 'requested', queuedCount: 1, checkedAt: 'now' });
      })
    );
    const { container } = render(
      <RerunIngestionButton creatorProfileId='cp-1' />
    );
    await user.click(screen.getByRole('button', BUTTON));
    await waitFor(() =>
      expect(screen.getByRole('button', BUTTON)).toBeDisabled()
    );
    expect(rerunActionMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
    // React entangles async transitions, so settle this one before the next test.
    finish();
    await waitFor(() =>
      expect(screen.getByRole('button', BUTTON)).toBeEnabled()
    );
  });

  it('shows the safe failure copy and skips the refresh when the action rejects', async () => {
    const user = userEvent.setup();
    rerunActionMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(
      <RerunIngestionButton creatorProfileId='cp-9' />
    );
    await user.click(screen.getByRole('button', BUTTON));
    expect(
      await screen.findByTestId('rerun-ingestion-error')
    ).toHaveTextContent(
      'Recovery could not be requested. The profile was left unchanged; try again.'
    );
    expect(
      (rerunActionMock.mock.calls[0][0] as FormData).get('profileId')
    ).toBe('cp-9');
    expect(refreshMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', BUTTON)).toBeEnabled()
    );
    await expectNoA11yViolations(container);
  });

  it('replaces an earlier error with the receipt on retry, axe-clean in RTL', async () => {
    const user = userEvent.setup();
    rerunActionMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        state: 'missing-source',
        queuedCount: 0,
        checkedAt: '2026-10-02T12:00:00.000Z',
      });
    const { container } = render(
      <div dir='rtl'>
        <RerunIngestionButton creatorProfileId='cp-1' />
      </div>
    );
    await user.click(screen.getByRole('button', BUTTON));
    await screen.findByTestId('rerun-ingestion-error');
    await waitFor(() =>
      expect(screen.getByRole('button', BUTTON)).toBeEnabled()
    );
    await user.click(screen.getByRole('button', BUTTON));
    expect(
      await screen.findByTestId('rerun-ingestion-receipt')
    ).toHaveTextContent('no linked Spotify source');
    expect(screen.queryByTestId('rerun-ingestion-error')).toBeNull();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
