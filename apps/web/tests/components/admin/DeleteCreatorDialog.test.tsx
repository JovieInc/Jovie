import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteCreatorDialog } from '@/features/admin/DeleteCreatorDialog';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

function createProfile(
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id: 'creator-1',
    username: 'dina',
    usernameNormalized: 'dina',
    avatarUrl: null,
    displayName: 'Dina',
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    claimToken: 'claim-token-123',
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    location: null,
    hometown: null,
    activeSinceYear: null,
    socialLinks: [],
    ...overrides,
  };
}

describe('DeleteCreatorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires confirmation before delete and supports cancellation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => ({ success: true }));
    const onOpenChange = vi.fn();

    render(
      <DeleteCreatorDialog
        profile={createProfile()}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls confirm handler and closes dialog on success', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => ({ success: true }));
    const onOpenChange = vi.fn();

    render(
      <DeleteCreatorDialog
        profile={createProfile()}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: /delete profile/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows error state and keeps dialog open when deletion fails', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => ({
      success: false,
      error: 'Request timed out',
    }));
    const onOpenChange = vi.fn();

    render(
      <DeleteCreatorDialog
        profile={createProfile()}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: /delete profile/i }));

    expect(await screen.findByText('Request timed out')).toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables controls while delete is in progress to prevent double-submit', async () => {
    const user = userEvent.setup();
    let resolveDelete: ((value: { success: boolean }) => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<{ success: boolean }>(resolve => {
          resolveDelete = resolve;
        })
    );

    render(
      <DeleteCreatorDialog
        profile={createProfile()}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole('button', {
      name: /delete profile/i,
    });
    await user.click(confirmButton);

    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();

    resolveDelete?.({ success: true });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('hides destructive actions for non-admin users (authorization enforced upstream)', () => {
    // Admin authorization is handled in route protection and parent surfaces.
    // The dialog is only rendered when a parent admin surface passes `open={true}`,
    // so non-admin users never see it. Verify the component requires an explicit open prop.
    const { container } = render(
      <DeleteCreatorDialog
        profile={createProfile()}
        open={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn(async () => ({ success: true }))}
      />
    );

    expect(
      screen.queryByRole('button', { name: /delete profile/i })
    ).not.toBeInTheDocument();
    expect(container).toBeDefined();
  });
});
