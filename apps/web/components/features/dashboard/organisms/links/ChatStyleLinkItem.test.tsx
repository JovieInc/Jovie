import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatStyleLinkItem } from './ChatStyleLinkItem';

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

describe('ChatStyleLinkItem', () => {
  it('renders the swipe-to-delete action with the error token, not raw red-* (JOV-6773)', () => {
    render(
      <ChatStyleLinkItem
        id='link-1'
        link={link}
        index={0}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onEdit={vi.fn()}
        visible
        openMenuId={null}
        onAnyMenuOpen={vi.fn()}
        isLastAdded={false}
      />
    );

    const handle = screen.getByRole('button', { name: 'Drag To Reorder' });
    expect(handle.closest('div[role="button"]')).toBeNull();
    expect(handle.querySelector('button, a, input')).toBeNull();
    const deleteAction = screen.getByLabelText('Delete Spotify');
    expect(deleteAction.className).toContain('bg-error');
    expect(deleteAction.className).not.toMatch(/\bred-\d/);
  });
  it('presses its row actions through the shared press utility', () => {
    render(
      <ChatStyleLinkItem
        id='link-1'
        link={link}
        index={0}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onEdit={vi.fn()}
        visible
        openMenuId={null}
        onAnyMenuOpen={vi.fn()}
        isLastAdded={false}
      />
    );
    expect(screen.getByLabelText('Delete Spotify')).toHaveClass('press');
  });
  function renderItem(
    overrides: Partial<React.ComponentProps<typeof ChatStyleLinkItem>> = {}
  ) {
    const handlers = {
      onToggle: vi.fn(),
      onRemove: vi.fn(),
      onEdit: vi.fn(),
      onAnyMenuOpen: vi.fn(),
    };
    const view = render(
      <ChatStyleLinkItem
        id='link-1'
        link={link}
        index={2}
        visible
        openMenuId={null}
        isLastAdded={false}
        {...handlers}
        {...overrides}
      />
    );
    return { ...view, ...handlers };
  }

  it('fires the swipe actions with the link index', async () => {
    const user = userEvent.setup();
    const { onEdit, onToggle, onRemove, container } = renderItem();

    await user.click(screen.getByLabelText('Edit Spotify'));
    expect(onEdit).toHaveBeenCalledWith(2);
    await user.click(screen.getByLabelText('Hide link'));
    expect(onToggle).toHaveBeenCalledWith(2);
    await user.click(screen.getByLabelText('Delete Spotify'));
    expect(onRemove).toHaveBeenCalledWith(2);
    await expectNoA11yViolations(container);
  });

  it('opens its action menu and runs a menu item', async () => {
    const user = userEvent.setup();
    const { onAnyMenuOpen } = renderItem();
    await user.click(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    );
    expect(onAnyMenuOpen).toHaveBeenCalledWith('link-1');
  });

  it('lists the menu when open and hides the drag handle when not draggable', async () => {
    const user = userEvent.setup();
    const { onEdit, onAnyMenuOpen, container } = renderItem({
      openMenuId: 'link-1',
      draggable: false,
      visible: false,
    });

    expect(
      screen.queryByRole('button', { name: 'Drag To Reorder' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(2);
    expect(onAnyMenuOpen).toHaveBeenCalledWith(null);
    await expectNoA11yViolations(container);
  });
});
