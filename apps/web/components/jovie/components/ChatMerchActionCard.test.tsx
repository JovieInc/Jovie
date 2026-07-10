import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatMerchActionCard } from './ChatMerchActionCard';

const mutateMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useConfirmChatMerchActionMutation: () => ({ mutate: mutateMock }),
}));

describe('ChatMerchActionCard', () => {
  it('renders publish confirmation and calls mutation on confirm', async () => {
    const user = userEvent.setup();
    render(
      <ChatMerchActionCard
        profileId='profile-1'
        merchCardId='card-1'
        action='publish'
        title='Tour Tee'
        currentStatus='draft'
        retailPrice='$25.00'
      />
    );

    expect(screen.getByText(/Publish Merch: Tour Tee/i)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /Publish/i });
    expect(confirmButton.className).toContain('bg-btn-primary');
    expect(confirmButton.className).toContain('text-btn-primary-foreground');
    expect(confirmButton.className).toContain('hover:bg-btn-primary-hover');

    await user.click(confirmButton);
    expect(mutateMock).toHaveBeenCalledWith(
      { profileId: 'profile-1', merchCardId: 'card-1', action: 'publish' },
      expect.any(Object)
    );
  });

  it('uses Play icon for Make Live and Cancelled dismiss copy', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatMerchActionCard
        profileId='profile-1'
        merchCardId='card-1'
        action='unpause'
        title='Tour Tee'
        currentStatus='paused'
        retailPrice='$25.00'
      />
    );

    expect(screen.getByRole('button', { name: /Make Live/i })).toBeTruthy();
    // lucide Play renders a triangle path; Pause would be two rects — assert no Pause label
    expect(container.querySelector('svg.lucide-pause')).toBeNull();
    expect(container.querySelector('svg.lucide-play')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /Cancel Action/i }));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('nested mode uses flat surface (no card-in-card)', () => {
    render(
      <ChatMerchActionCard
        profileId='profile-1'
        merchCardId='card-1'
        action='publish'
        title='Tour Tee'
        currentStatus='draft'
        retailPrice='$25.00'
        nested
      />
    );

    expect(screen.getByTestId('chat-tool-surface')).toHaveClass(
      'system-b-chat-tool-surface-flat'
    );
  });
});
