import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toast, approve, disapprove, resend } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  approve: vi.fn(),
  disapprove: vi.fn(),
  resend: vi.fn(),
}));
vi.mock('@/components/feedback', () => ({ toast }));
vi.mock('@/lib/queries', () => ({
  useApproveWaitlistMutation: () => ({ mutateAsync: approve }),
  useDisapproveWaitlistMutation: () => ({ mutateAsync: disapprove }),
  useResendWaitlistInviteMutation: () => ({ mutateAsync: resend }),
}));

import { useApproveEntry } from './useApproveEntry';

describe('useApproveEntry', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows the server reason when approve fails, never silently', async () => {
    approve.mockRejectedValue(
      new Error('No auth record found for this email.')
    );
    const onRowUpdate = vi.fn();
    const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));
    await act(async () => {
      await result.current.approveEntry({ id: 'w1', status: 'waitlisted' });
    });
    expect(toast.error).toHaveBeenCalledWith(
      'No auth record found for this email.'
    );
    expect(onRowUpdate).not.toHaveBeenCalled();
    expect(result.current.approveStatuses.w1).toBe('error');
  });

  it('confirms success with a toast and updates the row', async () => {
    approve.mockResolvedValue({ success: true });
    const onRowUpdate = vi.fn();
    const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));
    await act(async () => {
      await result.current.approveEntry({ id: 'w1', status: 'waitlisted' });
    });
    expect(toast.success).toHaveBeenCalled();
    expect(onRowUpdate).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ status: 'invited' })
    );
  });

  it.each(['invited', 'approved'] as const)(
    'confirms revoked access for an %s entry and updates the row',
    async status => {
      disapprove.mockResolvedValue({ success: true });
      const onRowUpdate = vi.fn();
      const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));

      await act(async () => {
        await result.current.approveEntry({ id: 'w1', status });
      });

      expect(disapprove).toHaveBeenCalledWith({ entryId: 'w1' });
      expect(approve).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Access revoked');
      expect(onRowUpdate).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ status: 'waitlisted' })
      );
      expect(result.current.approveStatuses.w1).toBe('success');
    }
  );

  it('keeps the row unchanged and explains a revoke failure', async () => {
    disapprove.mockRejectedValue(new Error('Access could not be revoked.'));
    const onRowUpdate = vi.fn();
    const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));

    await act(async () => {
      await result.current.approveEntry({ id: 'w1', status: 'invited' });
    });

    expect(toast.error).toHaveBeenCalledWith('Access could not be revoked.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onRowUpdate).not.toHaveBeenCalled();
    expect(result.current.approveStatuses.w1).toBe('error');
  });

  it('uses a readable fallback when approval fails without a reason', async () => {
    approve.mockRejectedValue(undefined);
    const onRowUpdate = vi.fn();
    const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));

    await act(async () => {
      await result.current.approveEntry({ id: 'w1', status: 'waitlisted' });
    });

    expect(toast.error).toHaveBeenCalledWith('Waitlist action failed');
    expect(onRowUpdate).not.toHaveBeenCalled();
  });

  it('updates the row after resending an invite', async () => {
    resend.mockResolvedValue({ success: true });
    const onRowUpdate = vi.fn();
    const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));

    await act(async () => {
      await result.current.resendInvite({ id: 'w1' });
    });

    expect(resend).toHaveBeenCalledWith({ entryId: 'w1' });
    expect(onRowUpdate).toHaveBeenCalledWith('w1', {
      updatedAt: expect.any(Date),
    });
    expect(result.current.approveStatuses.w1).toBe('success');
  });

  it.each([
    [new Error('No invite address found.'), 'No invite address found.'],
    [undefined, 'Failed to resend invite'],
  ])('explains a resend failure (%s)', async (error, message) => {
    resend.mockRejectedValue(error);
    const onRowUpdate = vi.fn();
    const { result } = renderHook(() => useApproveEntry({ onRowUpdate }));

    await act(async () => {
      await result.current.resendInvite({ id: 'w1' });
    });

    expect(toast.error).toHaveBeenCalledWith(message);
    expect(onRowUpdate).not.toHaveBeenCalled();
    expect(result.current.approveStatuses.w1).toBe('error');
  });
});
