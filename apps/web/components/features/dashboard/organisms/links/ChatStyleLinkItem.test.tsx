import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
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
  it.each([true, false])(
    'keeps nested actions outside the drag activator when draggable=%s',
    draggable => {
      const { container } = render(
        <ChatStyleLinkItem
          id='link-1'
          link={link}
          index={0}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onEdit={vi.fn()}
          visible
          draggable={draggable}
          openMenuId={null}
          onAnyMenuOpen={vi.fn()}
          isLastAdded={false}
        />
      );

      expect(container.firstElementChild).not.toHaveAttribute('role', 'button');
      expect(container.firstElementChild).not.toHaveAttribute('tabindex');
      const handle = screen.queryByRole('button', { name: 'Drag To Reorder' });
      if (draggable) {
        expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
        expect(handle).toHaveAttribute('aria-describedby');
      } else {
        expect(handle).not.toBeInTheDocument();
      }
      expect(
        screen.getByRole('button', { name: 'Open actions for Spotify' })
      ).toBeVisible();
    }
  );

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

    const deleteAction = screen.getByLabelText('Delete Spotify');
    expect(deleteAction.className).toContain('bg-error');
    expect(deleteAction.className).not.toMatch(/\bred-\d/);
  });
});
