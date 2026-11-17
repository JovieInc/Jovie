import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { isSsrNowMs, NowMsProvider, useNowMs } from './NowMsContext';

function Consumer() {
  const nowMs = useNowMs();
  return (
    <p>
      {isSsrNowMs(nowMs) ? 'placeholder' : 'hydrated'}:{nowMs}
    </p>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NowMsContext certificate', () => {
  it('returns the SSR placeholder without a provider', async () => {
    const { container } = render(<Consumer />);
    expect(screen.getByText('placeholder:0')).toBeInTheDocument();
    expect(isSsrNowMs(0)).toBe(true);
    expect(isSsrNowMs(1)).toBe(false);
    await expectNoA11yViolations(container);
  });

  it('hydrates to the real clock and refreshes every minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    const start = Date.now();
    const { container } = render(
      <NowMsProvider>
        <Consumer />
      </NowMsProvider>
    );
    expect(screen.getByText(`hydrated:${start}`)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(`hydrated:${start + 60_000}`)).toBeInTheDocument();
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('stops the refresh interval on unmount', () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(
      <NowMsProvider>
        <Consumer />
      </NowMsProvider>
    );
    unmount();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
