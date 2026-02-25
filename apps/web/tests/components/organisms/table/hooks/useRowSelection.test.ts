import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRowSelection } from '@/components/organisms/table/hooks/useRowSelection';

describe('useRowSelection', () => {
  it('toggles individual row selection correctly', () => {
    const { result } = renderHook(() => useRowSelection(['1', '2', '3']));

    act(() => {
      result.current.toggleSelect('1');
    });

    expect(result.current.selectedIds).toEqual(new Set(['1']));
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.headerCheckboxState).toBe('indeterminate');

    act(() => {
      result.current.toggleSelect('1');
    });

    expect(result.current.selectedIds).toEqual(new Set());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.headerCheckboxState).toBe(false);
  });

  it('selects and deselects all visible rows with toggleSelectAll', () => {
    const { result } = renderHook(() => useRowSelection(['1', '2']));

    act(() => {
      result.current.toggleSelectAll();
    });

    expect(result.current.selectedIds).toEqual(new Set(['1', '2']));
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.headerCheckboxState).toBe(true);

    act(() => {
      result.current.toggleSelectAll();
    });

    expect(result.current.selectedIds).toEqual(new Set());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.headerCheckboxState).toBe(false);
  });

  it('clears selection and removes stale selections when row ids change', () => {
    const { result, rerender } = renderHook(({ ids }) => useRowSelection(ids), {
      initialProps: { ids: ['1', '2', '3'] },
    });

    act(() => {
      result.current.setSelection(new Set(['1', '3']));
    });

    expect(result.current.selectedIds).toEqual(new Set(['1', '3']));

    rerender({ ids: ['2', '3', '4'] });

    expect(result.current.selectedIds).toEqual(new Set(['3']));

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedIds).toEqual(new Set());
    expect(result.current.selectedCount).toBe(0);
  });
});
