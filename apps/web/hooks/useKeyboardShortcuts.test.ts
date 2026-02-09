import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function fireKey(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...modifiers,
  });
  globalThis.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls handler when matching key is pressed', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', handler, description: 'Close' }])
    );

    fireKey('Escape');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('calls handler for Meta+key shortcuts', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'Meta+b', handler, description: 'Toggle sidebar' },
      ])
    );

    fireKey('b', { metaKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('calls handler for Ctrl+key shortcuts', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Ctrl+/', handler, description: 'Help' }])
    );

    fireKey('/', { ctrlKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('calls handler for Alt+Shift+key shortcuts', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'Shift+Alt+Q', handler, description: 'Sign out' },
      ])
    );

    fireKey('Q', { shiftKey: true, altKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not call handler when key does not match', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', handler, description: 'Close' }])
    );

    fireKey('Enter');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call disabled shortcut handlers', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'Escape', handler, description: 'Close', enabled: false },
      ])
    );

    fireKey('Escape');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handler when modifier does not match', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'Meta+b', handler, description: 'Toggle sidebar' },
      ])
    );

    // Press 'b' without Meta key
    fireKey('b');
    expect(handler).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', handler, description: 'Close' }])
    );

    unmount();
    fireKey('Escape');
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles multiple shortcuts', () => {
    const escHandler = vi.fn();
    const metaBHandler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'Escape', handler: escHandler, description: 'Close' },
        { key: 'Meta+b', handler: metaBHandler, description: 'Sidebar' },
      ])
    );

    fireKey('Escape');
    expect(escHandler).toHaveBeenCalledOnce();
    expect(metaBHandler).not.toHaveBeenCalled();

    fireKey('b', { metaKey: true });
    expect(metaBHandler).toHaveBeenCalledOnce();
  });
});
