import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayRetry } from './DisplayRetry';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('DisplayRetry', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says it is reconnecting and refreshes with backoff, starting at 2s', async () => {
    render(<DisplayRetry />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reconnecting display'
    );
    await vi.advanceTimersByTimeAsync(1_999);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
