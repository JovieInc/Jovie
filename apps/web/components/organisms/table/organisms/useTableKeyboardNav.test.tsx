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

function mountedRow() {
  const row = document.createElement('tr');
  row.tabIndex = 0;
  document.body.append(row);
  return row;
}

it.each([false, true])(
  'reveals keyboard rows immediately without scrolling unrelated focus updates (reduced motion: %s)',
  reducedMotion => {
    const originalMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: reducedMotion });
    const rows = [mountedRow(), mountedRow(), mountedRow()];
    const scrolls = rows.map(row => {
      const scroll = vi.fn();
      row.scrollIntoView = scroll;
      return scroll;
    });
    const { result, rerender, unmount } = renderHook(
      ({ focusedIndex }) =>
        useTableKeyboardNav({
          enabled: true,
          focusedIndex,
          rowCount: rows.length,
          rowRefsMap: new Map(rows.map((row, index) => [index, row])),
          setFocusedIndex: vi.fn(),
        }),
      { initialProps: { focusedIndex: 0 } }
    );
    try {
      rerender({ focusedIndex: 1 });
      for (const scroll of scrolls) expect(scroll).not.toHaveBeenCalled();
      for (const [key, index] of [
        ['ArrowDown', 1],
        ['Home', 0],
        ['End', 2],
      ] as const) {
        result.current.handleKeyDown(keyEvent(key), 0, 'row');
        expect(rows[index]).toHaveFocus();
        expect(scrolls[index]).toHaveBeenLastCalledWith({
          block: 'nearest',
          behavior: 'auto',
        });
      }
    } finally {
      unmount();
      for (const row of rows) row.remove();
      window.matchMedia = originalMedia;
    }
  }
);

it.each(['mounted', 'interrupted', 'scope-changed', 'superseded'] as const)(
  'owns virtual focus when the pending request is %s',
  state => {
    const origin = mountedRow();
    origin.focus();
    const refs = new Map([[0, origin]]);
    const scope = {};
    const revealRow = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ focusedIndex, window, focusScope }) =>
        useTableKeyboardNav({
          enabled: true,
          focusedIndex,
          rowCount: 30,
          rowRefsMap: refs,
          revealRow,
          setFocusedIndex: vi.fn(),
          renderedRowWindow: window,
          focusScope,
        }),
      { initialProps: { focusedIndex: 0, window: '0', focusScope: scope } }
    );
    result.current.handleKeyDown(keyEvent('End'), 0, 'first');
    expect(revealRow).toHaveBeenCalledWith(29);
    const input = document.createElement('input');
    document.body.append(input);
    if (state === 'interrupted') input.focus();
    if (state === 'superseded')
      result.current.handleKeyDown(keyEvent('Home'), 0, 'first');
    const destination = mountedRow();
    refs.set(29, destination);
    rerender({
      focusedIndex: state === 'superseded' ? 0 : 29,
      window: '29',
      focusScope: state === 'scope-changed' ? {} : scope,
    });
    expect(document.activeElement).toBe(
      state === 'mounted'
        ? destination
        : state === 'interrupted'
          ? input
          : origin
    );
    unmount();
    origin.remove();
    destination.remove();
    input.remove();
  }
);
