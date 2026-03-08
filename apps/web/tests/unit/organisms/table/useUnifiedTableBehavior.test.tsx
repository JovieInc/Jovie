import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUnifiedTableBehavior } from '@/components/organisms/table/organisms/useUnifiedTableBehavior';

describe('useUnifiedTableBehavior', () => {
  it('selects a range with shift+click using the last non-shift anchor', () => {
    const onRowSelectionChange = vi.fn();
    const onRowClick = vi.fn();

    const { result } = renderHook(() =>
      useUnifiedTableBehavior({
        enabled: true,
        focusedIndex: -1,
        rowCount: 4,
        rowRefsMap: new Map<number, HTMLTableRowElement>(),
        setFocusedIndex: vi.fn(),
        rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        rowIds: ['a', 'b', 'c', 'd'],
        rowSelection: {},
        onRowSelectionChange,
        onRowClick,
      })
    );

    act(() => {
      result.current.handleRowClick(1, { id: 'b' }, { shiftKey: false });
    });

    act(() => {
      result.current.handleRowClick(3, { id: 'd' }, { shiftKey: true });
    });

    expect(onRowSelectionChange).toHaveBeenNthCalledWith(1, { b: true });
    expect(onRowSelectionChange).toHaveBeenNthCalledWith(2, {
      b: true,
      c: true,
      d: true,
    });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('extends range and updates active row with shift+arrow', () => {
    const onRowSelectionChange = vi.fn();
    const onRowClick = vi.fn();
    const rowTwo = { id: '2' };

    const { result } = renderHook(() =>
      useUnifiedTableBehavior({
        enabled: true,
        focusedIndex: 1,
        rowCount: 3,
        rowRefsMap: new Map<number, HTMLTableRowElement>(),
        setFocusedIndex: vi.fn(),
        rows: [{ id: '1' }, rowTwo, { id: '3' }],
        rowIds: ['1', '2', '3'],
        rowSelection: { '2': true },
        onRowSelectionChange,
        onRowClick,
      })
    );

    act(() => {
      result.current.handleKeyDown(
        {
          key: 'ArrowDown',
          shiftKey: true,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent,
        1,
        rowTwo
      );
    });

    expect(onRowSelectionChange).toHaveBeenCalledWith({ '2': true, '3': true });
    expect(onRowClick).toHaveBeenCalledWith({ id: '3' });
  });
});
