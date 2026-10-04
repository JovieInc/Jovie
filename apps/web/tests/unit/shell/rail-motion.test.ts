import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHELL_RAIL_ALLOCATION,
  SHELL_RAIL_MOTION_MS,
  SHELL_RAIL_SHEET,
} from '@/components/shell/rail-motion';
import { useRailMotionPhase } from '@/components/shell/useRailMotionPhase';

const webRoot = path.resolve(__dirname, '../../..');

class MockMediaQueryList {
  matches: boolean;
  media = '(prefers-reduced-motion: reduce)';
  private listeners: Array<(event: MediaQueryListEvent) => void> = [];

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(
    event: string,
    listener: (event: MediaQueryListEvent) => void
  ) {
    if (event === 'change') this.listeners.push(listener);
  }

  removeEventListener(
    event: string,
    listener: (event: MediaQueryListEvent) => void
  ) {
    if (event === 'change') {
      this.listeners = this.listeners.filter(l => l !== listener);
    }
  }
}

describe('useRailMotionPhase (JOV-4522)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => new MockMediaQueryList(false))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports opening immediately on input — no dead interval', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useRailMotionPhase(open),
      { initialProps: { open: false } }
    );
    expect(result.current).toBe('closed');

    rerender({ open: true });
    // Same render as the input — motion starts on the next frame, not after
    // a settle delay or extra effect tick.
    expect(result.current).toBe('opening');
  });

  it('walks closed -> opening -> open in one cinematic duration', () => {
    let open = false;
    const { result, rerender } = renderHook(() => useRailMotionPhase(open));

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('closed');

    open = true;
    rerender();
    // Synchronous phase flip on the same render as the input.
    expect(result.current).toBe('opening');

    act(() => {
      vi.advanceTimersByTime(SHELL_RAIL_MOTION_MS - 1);
    });
    expect(result.current).toBe('opening');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('open');
  });

  it('is interruptible: toggling mid-exit resolves to the latest state', () => {
    let open = true;
    const { result, rerender } = renderHook(() => useRailMotionPhase(open));

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('open');

    open = false;
    rerender();
    expect(result.current).toBe('closing');

    // Interrupt halfway through the close: reopen.
    act(() => {
      vi.advanceTimersByTime(SHELL_RAIL_MOTION_MS / 2);
    });
    open = true;
    rerender();
    expect(result.current).toBe('opening');

    act(() => {
      vi.advanceTimersByTime(SHELL_RAIL_MOTION_MS);
    });
    expect(result.current).toBe('open');
  });

  it('settles closed after a full close, so rails go fully inert', () => {
    let open = true;
    const { result, rerender } = renderHook(() => useRailMotionPhase(open));

    act(() => {
      vi.advanceTimersByTime(0);
    });

    open = false;
    rerender();
    expect(result.current).toBe('closing');

    act(() => {
      vi.advanceTimersByTime(SHELL_RAIL_MOTION_MS);
    });
    expect(result.current).toBe('closed');
  });

  it('resolves directly to the final phase under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => new MockMediaQueryList(true))
    );
    let open = false;
    const { result, rerender } = renderHook(() => useRailMotionPhase(open));

    act(() => {
      vi.advanceTimersByTime(0);
    });

    open = true;
    rerender();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('open');
  });
});

describe('shell rail-motion tokens (JOV-4522)', () => {
  it('mirrors the cinematic duration token so phase settle matches CSS', () => {
    const css = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    expect(css).toContain(
      `--ds-motion-cinematic-duration: ${SHELL_RAIL_MOTION_MS}ms`
    );
  });

  it('keeps allocation, sheet, and label staging on cinematic timing with a reduced-motion exit', () => {
    for (const classes of [SHELL_RAIL_ALLOCATION, SHELL_RAIL_SHEET]) {
      expect(classes).toContain('duration-cinematic');
      expect(classes).toContain('ease-cinematic');
      expect(classes).toContain('motion-reduce:transition-none');
    }
  });
});
