import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAdminTableKeyboardNavigation } from '@/features/admin/table/useAdminTableKeyboardNavigation';

function Harness({ onActivate }: Readonly<{ onActivate?: () => void }>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { handleKeyDown } = useAdminTableKeyboardNavigation({
    items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    selectedId,
    onSelect: setSelectedId,
    onActivate,
  });

  return (
    <div>
      <div data-testid='selected-id'>{selectedId ?? ''}</div>
      <div
        data-testid='keyboard-target'
        role='application'
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

describe('useAdminTableKeyboardNavigation', () => {
  it('supports Home and End navigation keys', () => {
    const { getByTestId } = render(<Harness />);
    const target = getByTestId('keyboard-target');

    fireEvent.keyDown(target, { key: 'ArrowDown' });
    expect(getByTestId('selected-id').textContent).toBe('a');

    fireEvent.keyDown(target, { key: 'End' });
    expect(getByTestId('selected-id').textContent).toBe('c');

    fireEvent.keyDown(target, { key: 'Home' });
    expect(getByTestId('selected-id').textContent).toBe('a');
  });

  it('invokes onActivate when Enter is pressed on a selected row', () => {
    const onActivate = vi.fn();
    const { getByTestId } = render(<Harness onActivate={onActivate} />);
    const target = getByTestId('keyboard-target');

    fireEvent.keyDown(target, { key: 'ArrowDown' });
    fireEvent.keyDown(target, { key: 'Enter' });

    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
