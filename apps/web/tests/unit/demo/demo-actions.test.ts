import { describe, expect, it, vi } from 'vitest';

const dismiss = vi.fn();
const loading = vi.fn(() => 'toast-id');
const success = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    dismiss,
    loading,
    success,
  },
}));

const { runDemoAction } = await import('@/components/demo/demo-actions');

describe('runDemoAction', () => {
  it('shows loading and success toasts with simulated latency', async () => {
    vi.useFakeTimers();

    const promise = runDemoAction({
      loadingMessage: 'Working',
      successMessage: 'Done',
      latencyMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(loading).toHaveBeenCalledWith('Working');
    expect(dismiss).toHaveBeenCalledWith('toast-id');
    expect(success).toHaveBeenCalledWith('Done');

    vi.useRealTimers();
  });
});
