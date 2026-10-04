import { fireEvent, render, screen } from '@testing-library/react';
import { Paperclip } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import type { NavCommand } from '@/lib/commands/registry';

import { NavArt, PickerRow, pickerItemKey } from './picker-rows';

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

describe('NavArt icon mapping', () => {
  const nav = (iconName: string): NavCommand => ({
    kind: 'nav',
    id: `nav-${iconName}`,
    label: 'Row',
    description: 'Desc',
    iconName,
    surfaces: ['cmdk'],
    href: '/app',
  });

  it.each([
    ['User', 'lucide-user'],
    ['Layers', 'lucide-layers'],
    ['Megaphone', 'lucide-megaphone'],
  ])('maps %s to its Lucide glyph', (iconName, className) => {
    const { container } = render(<NavArt nav={nav(iconName)} />);
    expect(container.querySelector(`svg.${className}`)).not.toBeNull();
  });

  it('falls back to the calendar glyph for unknown names', () => {
    const { container } = render(<NavArt nav={nav('NotARealIcon')} />);
    expect(container.querySelector('svg.lucide-calendar')).not.toBeNull();
  });
});
