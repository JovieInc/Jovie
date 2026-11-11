import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileWebVitalsReporter } from './ProfileWebVitalsReporter';

const { mockInitWebVitals, mockDispose } = vi.hoisted(() => ({
  mockInitWebVitals: vi.fn(),
  mockDispose: vi.fn(),
}));

vi.mock('@/lib/monitoring/web-vitals', () => ({
  initWebVitals: (...args: unknown[]) => mockInitWebVitals(...args),
}));

async function flushDeferredInit() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

describe('ProfileWebVitalsReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInitWebVitals.mockReset();
    mockDispose.mockReset();
    mockInitWebVitals.mockReturnValue(mockDispose);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing and starts web vitals only after first paint', async () => {
    const { container } = render(
      <main>
        <h1>Tim White</h1>
        <ProfileWebVitalsReporter />
      </main>
    );
    expect(container.querySelector('main')?.children).toHaveLength(1);
    expect(mockInitWebVitals).not.toHaveBeenCalled();

    await flushDeferredInit();
    expect(mockInitWebVitals).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('re-dispatches each metric as a web-vitals event', async () => {
    const listener = vi.fn();
    globalThis.addEventListener('web-vitals', listener);
    render(<ProfileWebVitalsReporter />);
    await flushDeferredInit();

    const onMetric = mockInitWebVitals.mock.calls[0]?.[0] as (
      metric: unknown
    ) => void;
    onMetric({ name: 'LCP', value: 1200 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      name: 'LCP',
      value: 1200,
    });
    globalThis.removeEventListener('web-vitals', listener);
  });

  it('disposes the observers on unmount', async () => {
    const { unmount } = render(<ProfileWebVitalsReporter />);
    await flushDeferredInit();
    unmount();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('never starts when the page unmounts before the deferred init', async () => {
    const { unmount } = render(<ProfileWebVitalsReporter />);
    unmount();
    await flushDeferredInit();
    expect(mockInitWebVitals).not.toHaveBeenCalled();
  });

  it('swallows a failed web-vitals start so the profile keeps rendering', async () => {
    mockInitWebVitals.mockImplementation(() => {
      throw new Error('PerformanceObserver unavailable');
    });
    const { container } = render(
      <main>
        <h1>Tim White</h1>
        <ProfileWebVitalsReporter />
      </main>
    );
    await flushDeferredInit();
    expect(mockInitWebVitals).toHaveBeenCalledTimes(1);
    expect(container.querySelector('h1')).toHaveTextContent('Tim White');
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });
});
