import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerIngestionRecoveryReceipt } from '@/app/app/(shell)/admin/actions';
import { RerunIngestionButton } from './RerunIngestionButton';

const refreshMock = vi.fn();
const rerunActionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/app/app/(shell)/admin/actions', () => ({
  rerunCustomerIngestionAction: (fd: FormData) => rerunActionMock(fd),
}));

function receipt(
  state: CustomerIngestionRecoveryReceipt['state']
): CustomerIngestionRecoveryReceipt {
  return { state, queuedCount: 2, checkedAt: '2026-10-02T12:00:00.000Z' };
}

describe('RerunIngestionButton', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    rerunActionMock.mockReset();
  });

  it('posts the profile id to the recovery action and shows the receipt', async () => {
    rerunActionMock.mockResolvedValue(receipt('requested'));
    render(<RerunIngestionButton creatorProfileId='cp-1' />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Re-run Artist Ingestion' })
    );

    expect(rerunActionMock).toHaveBeenCalledTimes(1);
    const fd = rerunActionMock.mock.calls[0][0] as FormData;
    expect(fd.get('profileId')).toBe('cp-1');

    expect(
      await screen.findByText(/Recovery requested — ingestion jobs queued\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Queued: 2\. Checked 2026-10-02T12:00:00\.000Z/)
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it('explains a read-only refusal when a run is already in flight', async () => {
    rerunActionMock.mockResolvedValue(receipt('already-running'));
    render(<RerunIngestionButton creatorProfileId='cp-1' />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Re-run Artist Ingestion' })
    );

    expect(
      await screen.findByText(
        /No change: an ingestion run is already in flight\./
      )
    ).toBeInTheDocument();
  });

  it('shows a stable retryable error when the server action fails', async () => {
    rerunActionMock.mockRejectedValue(new Error('queue unavailable'));
    render(<RerunIngestionButton creatorProfileId='cp-1' />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Re-run Artist Ingestion' })
    );

    expect(
      await screen.findByTestId('rerun-ingestion-error')
    ).toHaveTextContent('profile was left unchanged; try again');
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
