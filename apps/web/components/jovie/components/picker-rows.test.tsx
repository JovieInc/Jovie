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

describe('picker-rows nav items', () => {
  it('resolves the Video icon for nav rows', () => {
    const item = {
      kind: 'nav' as const,
      nav: {
        kind: 'nav' as const,
        id: 'go-youtube-revival',
        label: 'YouTube revival queue',
        description: 'Review and revive back-catalog YouTube videos.',
        iconName: 'Video',
        surfaces: [],
        href: '/app/youtube',
      },
    };

    const { container } = render(
      <PickerRow
        item={item}
        index={0}
        isActive={false}
        onMouseEnter={vi.fn()}
        onCommit={vi.fn()}
      />
    );

    expect(container.querySelector('svg.lucide-video')).not.toBeNull();
    expect(
      screen.getByRole('option', { name: /YouTube revival queue/ })
    ).toBeInTheDocument();
    expect(pickerItemKey(item)).toBe('nav:go-youtube-revival');
  });
});
