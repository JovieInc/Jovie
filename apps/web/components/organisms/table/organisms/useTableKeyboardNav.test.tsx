import { renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTableKeyboardNav } from './useTableKeyboardNav';

function keyEvent(key: string) {
  return {
    key,
    target: document.body,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

function renderNav(onRowToggle?: (row: string) => void) {
  const onRowClick = vi.fn();
  const { result } = renderHook(() =>
    useTableKeyboardNav<string>({
      enabled: true,
      focusedIndex: 0,
      rowCount: 2,
      rowRefsMap: new Map(),
      setFocusedIndex: vi.fn(),
      onRowClick,
      onRowToggle,
    })
  );
  return { handleKeyDown: result.current.handleKeyDown, onRowClick };
}

describe('useTableKeyboardNav', () => {
  it('opens the row on Space when no toggle is given', () => {
    const { handleKeyDown, onRowClick } = renderNav();
    handleKeyDown(keyEvent(' '), 0, 'row-a');
    expect(onRowClick).toHaveBeenCalledWith('row-a');
  });

  it('routes Space to onRowToggle and keeps Enter on onRowClick', () => {
    const onRowToggle = vi.fn();
    const { handleKeyDown, onRowClick } = renderNav(onRowToggle);

    handleKeyDown(keyEvent(' '), 1, 'row-b');
    expect(onRowToggle).toHaveBeenCalledWith('row-b');
    expect(onRowClick).not.toHaveBeenCalled();

    handleKeyDown(keyEvent('Enter'), 1, 'row-b');
    expect(onRowClick).toHaveBeenCalledWith('row-b');
  });
});
