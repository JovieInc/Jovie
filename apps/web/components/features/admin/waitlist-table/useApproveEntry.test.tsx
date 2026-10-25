import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toast, approve } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  approve: vi.fn(),
}));
vi.mock('@/components/feedback', () => ({ toast }));
vi.mock('@/lib/queries', () => ({
  useApproveWaitlistMutation: () => ({ mutateAsync: approve }),
  useDisapproveWaitlistMutation: () => ({ mutateAsync: vi.fn() }),
  useResendWaitlistInviteMutation: () => ({ mutateAsync: vi.fn() }),
}));

import { useApproveEntry } from './useApproveEntry';

describe('useApproveEntry', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
