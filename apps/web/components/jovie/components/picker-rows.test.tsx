import { fireEvent, render, screen } from '@testing-library/react';
import { Paperclip } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { PickerRow, pickerItemKey } from './picker-rows';

describe('picker-rows action items', () => {
  it('renders action copy and commits the shared palette row', () => {
    const onCommit = vi.fn();
    const item = {
      kind: 'action' as const,
      action: {
        id: 'attach-files',
        label: 'Attach Files',
        description: 'Drop or browse',
        icon: Paperclip,
        onSelect: vi.fn(),
      },
    };

    render(
      <PickerRow
        item={item}
        index={0}
        isActive
        onMouseEnter={vi.fn()}
        onCommit={onCommit}
      />
    );

    expect(
      screen.getByRole('option', { name: /Attach Files/ })
    ).toHaveTextContent('Drop or browse');
    expect(pickerItemKey(item)).toBe('action:attach-files');
    fireEvent.mouseDown(screen.getByRole('option'));
    expect(onCommit).toHaveBeenCalledWith(0);
  });
});
