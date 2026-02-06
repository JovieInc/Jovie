import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

import { copyToClipboard, useClipboard } from '@/hooks/useClipboard';

describe('useClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset clipboard API mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('should start with idle status', () => {
    const { result } = renderHook(() => useClipboard());

    expect(result.current.status).toBe('idle');
    expect(result.current.isCopying).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('should copy text successfully using Clipboard API', async () => {
    const { result } = renderHook(() => useClipboard());

    let success: boolean;
    await act(async () => {
      success = await result.current.copy('Hello, World!');
    });

    expect(success!).toBe(true);
    expect(result.current.status).toBe('success');
    expect(result.current.isSuccess).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello, World!');
  });

  it('should call onSuccess callback on successful copy', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useClipboard({ onSuccess }));

    await act(async () => {
      await result.current.copy('text');
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('should handle Clipboard API failure with fallback', async () => {
    // Mock Clipboard API to fail
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
      },
    });

    // Mock document.execCommand for fallback
    document.execCommand = vi.fn().mockReturnValue(true);

    const { result } = renderHook(() => useClipboard());

    let success: boolean;
    await act(async () => {
      success = await result.current.copy('fallback text');
    });

    expect(success!).toBe(true);
    expect(result.current.isSuccess).toBe(true);
  });

  it('should set error status when all copy methods fail', async () => {
    // No clipboard API
    Object.assign(navigator, {
      clipboard: undefined,
    });

    // Fallback also fails
    document.execCommand = vi.fn().mockReturnValue(false);

    const onError = vi.fn();
    const { result } = renderHook(() => useClipboard({ onError }));

    let success: boolean;
    await act(async () => {
      success = await result.current.copy('text');
    });

    expect(success!).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.isError).toBe(true);
    expect(onError).toHaveBeenCalled();
  });

  it('should reset status manually', async () => {
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy('text');
    });
    expect(result.current.isSuccess).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
  });

  it('should auto-reset status after delay', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useClipboard({ resetDelay: 1000 }));

    await act(async () => {
      await result.current.copy('text');
    });
    expect(result.current.isSuccess).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe('idle');

    vi.useRealTimers();
  });
});

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('should copy text using Clipboard API', async () => {
    const result = await copyToClipboard('test');
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test');
  });

  it('should use fallback when Clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(true);

    const result = await copyToClipboard('test');
    expect(result).toBe(true);
  });

  it('should return false when all methods fail', async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);

    const result = await copyToClipboard('test');
    expect(result).toBe(false);
  });
});
