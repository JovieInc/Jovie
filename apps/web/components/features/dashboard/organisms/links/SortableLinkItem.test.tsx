import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SortableLinkItem } from './SortableLinkItem';

const link: DetectedLink = {
  platform: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '#1ED760',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  normalizedUrl: 'https://open.spotify.com/artist/sasha-waves',
  originalUrl: 'https://open.spotify.com/artist/sasha-waves',
  suggestedTitle: 'Spotify',
  isValid: true,
};

function renderItem(
  overrides: Partial<React.ComponentProps<typeof SortableLinkItem>> = {}
) {
  const handlers = {
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onEdit: vi.fn(),
    onAnyMenuOpen: vi.fn(),
  };
  const view = render(
    <DndContext>
      <SortableContext items={['link-1']}>
        <SortableLinkItem
          id='link-1'
          link={link}
          index={1}
          visible
          openMenuId={null}
          isLastAdded={false}
          buildPillLabel={item => item.suggestedTitle}
          {...handlers}
          {...overrides}
        />
      </SortableContext>
    </DndContext>
  );
  return { ...view, ...handlers };
}

describe('SortableLinkItem', () => {
  it('fires the swipe actions with the link index and uses the error token', async () => {
    const user = userEvent.setup();
    const { onEdit, onToggle, onRemove, container } = renderItem();

    // The dnd-kit pointer sensor owns pointer-down on the row, so the swipe
    // actions are driven from the keyboard.
    screen.getByLabelText('Edit Spotify').focus();
    await user.keyboard('{Enter}');
    expect(onEdit).toHaveBeenCalledWith(1);
    screen.getByLabelText('Hide link').focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith(1);
    const del = screen.getByLabelText('Delete Spotify');
    expect(del).toHaveClass('bg-error', 'text-error-foreground');
    del.focus();
    await user.keyboard('{Enter}');
    expect(onRemove).toHaveBeenCalledWith(1);
    await expectNoA11yViolations(container);
  });

  it('renders the keyboard drag handle only when draggable', () => {
    const { unmount } = renderItem();
    expect(
      screen.getByRole('button', { name: 'Drag to reorder Spotify' })
    ).toBeInTheDocument();
    unmount();
    renderItem({ draggable: false });
    expect(
      screen.queryByRole('button', { name: 'Drag to reorder Spotify' })
    ).not.toBeInTheDocument();
  });

  it('shows hidden and invalid states axe-clean', async () => {
    const hidden = renderItem({ visible: false });
    expect(screen.getByLabelText('Show link')).toBeInTheDocument();
    await expectNoA11yViolations(hidden.container);
    hidden.unmount();

    const invalid = renderItem({ link: { ...link, isValid: false } });
    expect(screen.getByLabelText('Hide link')).toBeInTheDocument();
    await expectNoA11yViolations(invalid.container);
  });
});
