import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { CreatorActionsMenu } from './CreatorActionsMenu';

const profile = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
} as unknown as AdminCreatorProfileRow;

function renderMenu(
  overrides: Partial<Parameters<typeof CreatorActionsMenu>[0]> = {}
) {
  const props = {
    profile,
    isMobile: false,
    status: 'idle' as const,
    onToggleVerification: vi.fn(async () => {}),
    onToggleFeatured: vi.fn(async () => {}),
    onToggleMarketing: vi.fn(async () => {}),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<CreatorActionsMenu {...props} />);
  return props;
}

describe('CreatorActionsMenu', () => {
  it('opens the menu and renders the delete item in the AA error text color', async () => {
    const user = userEvent.setup();
    const props = renderMenu();
    await user.click(
      screen.getByRole('button', { name: 'Open creator actions' })
    );
    const del = await screen.findByRole('menuitem', { name: /Delete user/ });
    expect(del).toHaveStyle({ color: 'var(--color-error-text)' });
    await user.click(del);
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it('disables the trigger while an action is loading', () => {
    renderMenu({ status: 'loading' });
    expect(
      screen.getByRole('button', { name: 'Open creator actions' })
    ).toBeDisabled();
  });

  it('makes the trigger inert while the controlled menu is open', () => {
    renderMenu({ isMobile: true, open: true, onOpenChange: vi.fn() });
    const trigger = document.querySelector('[inert]');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveTextContent('Actions');
  });
});
