import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RerunIngestionButton } from './RerunIngestionButton';

const refreshMock = vi.fn();
const rerunActionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/app/app/(shell)/admin/actions', () => ({
  rerunCustomerIngestionAction: (fd: FormData) => rerunActionMock(fd),
}));

describe('RerunIngestionButton', () => {
  it('shows requested and retryable failure receipts', async () => {
    rerunActionMock.mockResolvedValue({ state: 'requested' });
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
    expect(refreshMock).toHaveBeenCalled();
    rerunActionMock.mockRejectedValue(new Error('queue unavailable'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Re-run Artist Ingestion' })
    );

    expect(
      await screen.findByText(/profile was left unchanged/)
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
