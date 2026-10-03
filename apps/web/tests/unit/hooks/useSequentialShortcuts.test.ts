import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockPathname = vi.hoisted(() => vi.fn(() => '/app'));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}));

vi.mock('@/lib/keyboard-shortcuts', () => ({
  KEYBOARD_SHORTCUTS: [
    {
      id: 'nav-dashboard',
      key: 'G then D',
      description: 'Go to Dashboard',
      firstKey: 'g',
      secondKey: 'd',
      href: '/app',
      isSequential: true,
    },
    {
      id: 'nav-settings',
      key: 'G then S',
      description: 'Go to Settings',
      firstKey: 'g',
      secondKey: 's',
      href: '/app/settings',
      isSequential: true,
    },
    {
      id: 'nav-chat',
      key: 'G then T',
      description: 'Go to conversation',
      firstKey: 'g',
      secondKey: 't',
      href: '/app/chat',
      isSequential: true,
    },
  ],
}));

import { useSequentialShortcuts } from '@/hooks/useSequentialShortcuts';

describe('useSequentialShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/app');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function dispatchKeyDown(
    opts: Partial<KeyboardEventInit> & { key?: string | undefined }
  ) {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      ...opts,
    });
    if (opts.key === undefined && 'key' in opts) {
      Object.defineProperty(event, 'key', { value: undefined });
    }
    globalThis.dispatchEvent(event);
    return event;
  }

  it('navigates on G then D sequence', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      dispatchKeyDown({ key: 'g' });
    });
    act(() => {
      dispatchKeyDown({ key: 'd' });
    });

    expect(mockPush).toHaveBeenCalledWith('/app');
  });

  it('navigates on G then S sequence', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      dispatchKeyDown({ key: 'g' });
    });
    act(() => {
      dispatchKeyDown({ key: 's' });
    });

    expect(mockPush).toHaveBeenCalledWith('/app/settings');
  });

  it('routes G then T to the customer chat route in the customer workspace', () => {
    renderHook(() => useSequentialShortcuts());

    act(() => {
      dispatchKeyDown({ key: 'g' });
    });
    act(() => {
      dispatchKeyDown({ key: 't' });
    });

    expect(mockPush).toHaveBeenCalledWith('/app/chat');
  });

  it('routes G then T to a fresh OV thread inside the OV workspace', () => {
    mockPathname.mockReturnValue('/app/ov/chat');
    renderHook(() => useSequentialShortcuts());

    act(() => {
      dispatchKeyDown({ key: 'g' });
    });
    act(() => {
      dispatchKeyDown({ key: 't' });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0]?.[0]).toMatch(/^\/app\/ov\/chat\?new=.+/);
  });

  it('does not crash when event.key is undefined', () => {
    renderHook(() => useSequentialShortcuts());

    expect(() => {
      act(() => {
        dispatchKeyDown({ key: undefined });
      });
    }).not.toThrow();

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when disabled', () => {
    renderHook(() => useSequentialShortcuts({ enabled: false }));

    act(() => {
      dispatchKeyDown({ key: 'g' });
    });
    act(() => {
      dispatchKeyDown({ key: 'd' });
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears sequence after timeout', () => {
    renderHook(() => useSequentialShortcuts({ sequenceTimeout: 500 }));

    act(() => {
      dispatchKeyDown({ key: 'g' });
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      dispatchKeyDown({ key: 'd' });
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls onOpenShortcutsModal on Cmd+/', () => {
    const onOpen = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal: onOpen }));

    act(() => {
      dispatchKeyDown({ key: '/', metaKey: true });
    });

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('calls onOpenShortcutsModal on ? (Shift+/)', () => {
    const onOpen = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal: onOpen }));

    act(() => {
      dispatchKeyDown({ key: '?' });
    });

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('does not open modal on ? when typing in form elements', () => {
    const onOpen = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal: onOpen }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: '?',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      globalThis.dispatchEvent(event);
    });

    expect(onOpen).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does not open modal on Cmd+? (modifier + ?)', () => {
    const onOpen = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal: onOpen }));

    act(() => {
      dispatchKeyDown({ key: '?', metaKey: true });
    });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('suppresses shortcuts when typing in form elements', () => {
    renderHook(() => useSequentialShortcuts());

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'g',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      globalThis.dispatchEvent(event);
    });
    act(() => {
      dispatchKeyDown({ key: 'd' });
    });

    expect(mockPush).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
