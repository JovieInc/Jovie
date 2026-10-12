import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAmbientField } from './ambient-field-gl';
import {
  MarketingAmbientField,
  shouldRunAmbientField,
} from './MarketingAmbientField';

vi.mock('./ambient-field-gl', () => ({ startAmbientField: vi.fn() }));

interface FakeWindowOptions {
  readonly reducedMotion?: boolean;
  readonly saveData?: boolean;
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly webgl2?: boolean;
}

function fakeWindow({
  reducedMotion = false,
  saveData = false,
  deviceMemory = 8,
  hardwareConcurrency = 8,
  webgl2 = true,
}: FakeWindowOptions = {}): Window {
  return {
    matchMedia: (query: string) => ({
      matches: query.includes('reduce') && reducedMotion,
    }),
    navigator: {
      connection: { saveData },
      deviceMemory,
      hardwareConcurrency,
    },
    WebGL2RenderingContext: webgl2 ? function WebGL2() {} : undefined,
  } as unknown as Window;
}

describe('shouldRunAmbientField', () => {
  it('runs on a capable device with motion allowed', () => {
    expect(shouldRunAmbientField(fakeWindow())).toBe(true);
  });

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['data saver', { saveData: true }],
    ['low memory', { deviceMemory: 2 }],
    ['few cores', { hardwareConcurrency: 2 }],
    ['no WebGL2', { webgl2: false }],
  ] as const)('keeps the static poster under %s', (_label, options) => {
    expect(shouldRunAmbientField(fakeWindow(options))).toBe(false);
  });
});

describe('MarketingAmbientField', () => {
  beforeEach(() => {
    vi.mocked(startAmbientField).mockReset();
  });

  afterEach(() => {
    // Unmount while the stubbed globals still exist; effect cleanup uses them.
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('server-renders a decorative poster in the section accent', () => {
    render(<MarketingAmbientField accent='purple' />);
    const field = screen.getByTestId('marketing-ambient-field');

    expect(field).toHaveAttribute('aria-hidden', 'true');
    expect(field).toHaveAttribute('data-accent', 'purple');
    expect(field).toHaveAttribute('data-live', 'false');
  });

  it('never loads the GL layer when reduced motion is requested', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<MarketingAmbientField accent='blue' />);

    expect(idle).not.toHaveBeenCalled();
    expect(screen.getByTestId('marketing-ambient-field')).toHaveAttribute(
      'data-live',
      'false'
    );
  });

  describe('on a capable device', () => {
    let motionListeners: Set<() => void>;
    let idleCallback: (() => void) | undefined;
    let fillStyle = '';
    const stop = vi.fn();

    beforeEach(() => {
      motionListeners = new Set();
      idleCallback = undefined;
      stop.mockReset();
      vi.stubGlobal('WebGL2RenderingContext', function WebGL2() {});
      vi.stubGlobal('matchMedia', () => ({
        matches: false,
        addEventListener: (_type: string, listener: () => void) =>
          motionListeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          motionListeners.delete(listener),
      }));
      vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
        idleCallback = callback;
        return 7;
      });
      vi.stubGlobal('cancelIdleCallback', vi.fn());
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        set fillStyle(value: string) {
          fillStyle = value;
        },
        get fillStyle() {
          return fillStyle;
        },
        getImageData: () => ({
          data: fillStyle === '#7c3aed' ? [124, 58, 237, 255] : [8, 9, 10, 255],
        }),
      } as never);
      vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
        backgroundColor: 'rgb(8, 9, 10)',
        getPropertyValue: (name: string) =>
          name === '--ambient-accent' ? ' #7c3aed ' : '',
      } as never);
      vi.mocked(startAmbientField).mockReturnValue({ stop });
    });

    it('loads the GL layer after idle with the resolved accent and base', async () => {
      render(<MarketingAmbientField accent='purple' />);
      expect(startAmbientField).not.toHaveBeenCalled();

      idleCallback?.();
      await waitFor(() => expect(startAmbientField).toHaveBeenCalledTimes(1));

      const [canvas, colors, onFirstFrame] =
        vi.mocked(startAmbientField).mock.calls[0];
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(colors.accent).toEqual([124 / 255, 58 / 255, 237 / 255]);
      expect(colors.base).toEqual([8 / 255, 9 / 255, 10 / 255]);

      const field = screen.getByTestId('marketing-ambient-field');
      expect(field).toHaveAttribute('data-live', 'false');
      act(() => onFirstFrame());
      expect(field).toHaveAttribute('data-live', 'true');
    });

    it('drops back to the poster when reduced motion turns on mid-session', async () => {
      render(<MarketingAmbientField accent='blue' />);
      idleCallback?.();
      await waitFor(() => expect(startAmbientField).toHaveBeenCalled());
      act(() => vi.mocked(startAmbientField).mock.calls[0][2]());

      act(() => {
        for (const listener of motionListeners) listener();
      });

      expect(stop).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('marketing-ambient-field')).toHaveAttribute(
        'data-live',
        'false'
      );
    });

    it('keeps the poster when the accent token does not resolve', async () => {
      vi.mocked(globalThis.getComputedStyle).mockReturnValue({
        backgroundColor: 'rgb(8, 9, 10)',
        getPropertyValue: () => '',
      } as never);
      render(<MarketingAmbientField accent='green' />);
      idleCallback?.();
      await act(async () => {
        await import('./ambient-field-gl');
      });

      expect(startAmbientField).not.toHaveBeenCalled();
    });

    it('cancels pending work and stops the renderer on unmount', async () => {
      const view = render(<MarketingAmbientField accent='orange' />);
      idleCallback?.();
      await waitFor(() => expect(startAmbientField).toHaveBeenCalled());

      view.unmount();

      expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(7);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(motionListeners.size).toBe(0);
    });

    it('falls back to a timeout without requestIdleCallback', () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal('requestIdleCallback', undefined);
        Reflect.deleteProperty(globalThis, 'requestIdleCallback');
        const view = render(<MarketingAmbientField accent='pink' />);
        expect(vi.getTimerCount()).toBe(1);

        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
