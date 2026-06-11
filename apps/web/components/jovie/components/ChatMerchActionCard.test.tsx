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
    await user.click(screen.getByRole('button', { name: /Publish/i }));
    expect(mutateMock).toHaveBeenCalledWith(
      { profileId: 'profile-1', merchCardId: 'card-1', action: 'publish' },
      expect.any(Object)
    );
  });
});
