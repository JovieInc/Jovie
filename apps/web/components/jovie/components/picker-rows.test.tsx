import { fireEvent, render, screen } from '@testing-library/react';
import { Paperclip } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { PickerNavItem } from './picker-rows';

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

describe('picker-rows navigation icons', () => {
  it.each([
    ['CalendarDays', 'lucide-calendar-days'],
    ['LineChart', 'lucide-line-chart'],
    ['ListTodo', 'lucide-list-todo'],
    ['Youtube', 'lucide-square-play'],
  ])('renders the registered %s icon', (iconName, iconClass) => {
    const item: PickerNavItem = {
      kind: 'nav',
      nav: {
        kind: 'nav',
        id: 'destination',
        label: 'Destination',
        description: 'Open workspace',
        iconName,
        surfaces: ['cmdk'],
        href: APP_ROUTES.CHAT,
      },
    };
    const { container } = render(
      <PickerRow
        item={item}
        index={0}
        isActive
        onMouseEnter={vi.fn()}
        onCommit={vi.fn()}
      />
    );
    expect(container.querySelector('svg')).toHaveClass(iconClass);
  });
});
