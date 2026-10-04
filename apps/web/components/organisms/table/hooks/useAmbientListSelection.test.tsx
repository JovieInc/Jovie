import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAmbientListSelection } from './useAmbientListSelection';

describe('ambient list keyboard ownership', () => {
  it.each(['J', 'K'])('leaves Shift+%s to its owning surface', key => {
    const onSelect = vi.fn();
    renderHook(() =>
      useAmbientListSelection({
        enabled: true,
        count: 4,
        selectedIndex: 1,
        onSelect,
      })
    );

    expect(fireEvent.keyDown(document.body, { key, shiftKey: true })).toBe(
      true
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('continues to own ordinary j/k navigation', () => {
    const onSelect = vi.fn();
    renderHook(() =>
      useAmbientListSelection({
        enabled: true,
        count: 4,
        selectedIndex: 1,
        onSelect,
      })
    );

    fireEvent.keyDown(document.body, { key: 'j' });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(document.body, { key: 'k' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });
});
