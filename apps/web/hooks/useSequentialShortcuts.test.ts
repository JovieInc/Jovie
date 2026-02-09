import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Must import after mocks
import { useSequentialShortcuts } from './useSequentialShortcuts';

function fireKey(
  key: string,
  target?: HTMLElement,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...modifiers,
  });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  globalThis.dispatchEvent(event);
  return event;
}

describe('useSequentialShortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('navigates on valid G then D sequence', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      fireKey('g');
    });
    act(() => {
      fireKey('d');
    });

    expect(mockPush).toHaveBeenCalledWith('/app');
  });

  it('navigates on valid G then P sequence', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      fireKey('g');
    });
    act(() => {
      fireKey('p');
    });

    expect(mockPush).toHaveBeenCalledWith('/app/profile');
  });

  it('navigates on valid G then O sequence (tour dates)', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      fireKey('g');
    });
    act(() => {
      fireKey('o');
    });

    expect(mockPush).toHaveBeenCalledWith('/app/tour-dates');
  });

  it('does not navigate if sequence times out', () => {
    renderHook(() => useSequentialShortcuts({ sequenceTimeout: 1000 }));

    act(() => {
      fireKey('g');
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      fireKey('d');
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate on invalid second key', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      fireKey('g');
    });
    act(() => {
      fireKey('z');
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ignores shortcuts in input elements', () => {
    renderHook(() => useSequentialShortcuts());
    const input = document.createElement('input');

    act(() => {
      fireKey('g', input);
    });
    act(() => {
      fireKey('d', input);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ignores shortcuts in textarea elements', () => {
    renderHook(() => useSequentialShortcuts());
    const textarea = document.createElement('textarea');

    act(() => {
      fireKey('g', textarea);
    });
    act(() => {
      fireKey('d', textarea);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ignores shortcuts in contentEditable elements', () => {
    renderHook(() => useSequentialShortcuts());
    const div = document.createElement('div');
    div.contentEditable = 'true';

    act(() => {
      fireKey('g', div);
    });
    act(() => {
      fireKey('d', div);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when disabled', () => {
    renderHook(() => useSequentialShortcuts({ enabled: false }));

    act(() => {
      fireKey('g');
    });
    act(() => {
      fireKey('d');
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls onOpenShortcutsModal for Cmd+/', () => {
    const onOpenShortcutsModal = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal }));

    act(() => {
      fireKey('/', undefined, { metaKey: true });
    });

    expect(onOpenShortcutsModal).toHaveBeenCalledOnce();
  });

  it('calls onOpenShortcutsModal for Ctrl+/', () => {
    const onOpenShortcutsModal = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal }));

    act(() => {
      fireKey('/', undefined, { ctrlKey: true });
    });

    expect(onOpenShortcutsModal).toHaveBeenCalledOnce();
  });

  it('cleans up event listener on unmount', () => {
    const { unmount } = renderHook(() => useSequentialShortcuts());

    unmount();

    act(() => {
      fireKey('g');
    });
    act(() => {
      fireKey('d');
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
