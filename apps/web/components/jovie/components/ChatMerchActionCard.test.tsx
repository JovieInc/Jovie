import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    // JOV-6774: canonical --color-btn-primary-* tokens, not legacy --linear-*.
    expect(confirmButton.className).toContain('--color-btn-primary-bg');
    expect(confirmButton.className).toContain('--color-btn-primary-hover');
    expect(confirmButton.className).not.toContain('linear-btn');

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
    expect(screen.getByTestId('chat-merch-dismiss-undo')).toHaveClass(
      'h-auto',
      'min-h-7',
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
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

describe('ChatMerchActionCard destructive contrast (JOV-8873)', () => {
  it('uses the destructive button tokens for archive', () => {
    render(
      <ChatMerchActionCard
        profileId='profile-1'
        merchCardId='card-1'
        action='archive'
        title='Tour Tee'
        currentStatus='live'
        retailPrice='$25.00'
      />
    );
    const destructive = screen
      .getAllByRole('button')
      .find(button =>
        button.className.includes('bg-(--color-btn-destructive-bg)')
      );
    expect(destructive).toBeDefined();
    expect(destructive?.className).toContain(
      'text-(--color-btn-destructive-fg)'
    );
  });
});

describe('ChatMerchActionCard states', () => {
  const props = {
    profileId: 'profile-1',
    merchCardId: 'card-1',
    action: 'archive' as const,
    title: 'Tour Tee',
    currentStatus: 'live',
    retailPrice: '$25.00',
  };

  it('renders plain-button actions with the consequence and stays axe-clean', async () => {
    const { container } = render(<ChatMerchActionCard {...props} />);
    const confirm = screen.getByRole('button', { name: 'Archive' });
    expect(confirm).toHaveAttribute('data-slot', 'plain-button');
    expect(screen.getByText(/Removes this item/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the success label after the mutation succeeds', async () => {
    mutateMock.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.()
    );
    const user = userEvent.setup();
    const { container } = render(<ChatMerchActionCard {...props} />);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(screen.getByText('Merch archived')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows an error and re-enables the action when the mutation fails', async () => {
    mutateMock.mockImplementationOnce(
      (_vars: unknown, opts: { onError?: () => void }) => opts.onError?.()
    );
    const user = userEvent.setup();
    const { container } = render(<ChatMerchActionCard {...props} />);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(
      screen.getByText('Unable to apply merch action. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('dismisses and restores through Undo', async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatMerchActionCard {...props} />);
    await user.click(screen.getByRole('button', { name: 'Cancel Action' }));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByTestId('chat-merch-dismiss-undo'));
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});
