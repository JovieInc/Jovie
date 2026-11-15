import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DeleteCreatorDialog } from './DeleteCreatorDialog';

const profile: AdminCreatorProfileRow = {
  id: 'creator_1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: null,
  createdAt: null,
  ingestionStatus: 'idle',
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
};

type Result = { success: boolean; error?: string };

function renderDialog(
  overrides: Partial<AdminCreatorProfileRow> = {},
  onConfirm: () => Promise<Result> = vi.fn(async () => ({ success: true }))
) {
  const onOpenChange = vi.fn();
  const view = render(
    <DeleteCreatorDialog
      profile={{ ...profile, ...overrides }}
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
  return { ...view, onOpenChange, onConfirm };
}

describe('DeleteCreatorDialog certificate', () => {
  it('renders nothing without a profile', () => {
    const { container } = render(
      <DeleteCreatorDialog
        profile={null}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('lists unclaimed data and closes after a successful delete', async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = renderDialog();

    expect(
      screen.getByRole('alertdialog', { name: 'Delete Creator Profile' })
    ).toHaveAccessibleDescription(
      "This will permanently delete @alice's profile."
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await expectNoA11yViolations(document.body);

    await user.click(screen.getByRole('button', { name: 'Delete Profile' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open with the server error after a failed delete', async () => {
    const user = userEvent.setup();
    let resolve: (value: Result) => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<Result>(r => {
          resolve = r;
        })
    );
    // The controlled dialog stays open while the parent keeps open=true.
    renderDialog({}, onConfirm);

    await user.click(screen.getByRole('button', { name: 'Delete Profile' }));
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    resolve({ success: false, error: 'Profile is linked to a payout.' });
    expect(
      await screen.findByText('Profile is linked to a payout.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete Profile' })
    ).toBeEnabled();
    await expectNoA11yViolations(document.body);
  });

  it('falls back to a generic error and clears it on cancel', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(
      {},
      vi.fn(async () => ({ success: false }))
    );

    await user.click(screen.getByRole('button', { name: 'Delete Profile' }));
    expect(await screen.findByText('Failed to delete')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Failed to delete')).toBeNull();
  });

  it('lists every account data class for a claimed long handle in RTL', async () => {
    render(
      <div dir='rtl' lang='ar'>
        <DeleteCreatorDialog
          profile={{
            ...profile,
            username: 'an-artist-with-a-remarkably-long-handle-name-2026',
            isClaimed: true,
            userId: 'user_1',
          }}
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn(async () => ({ success: true }))}
        />
      </div>
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Delete User Account' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(
      screen.getByRole('button', { name: 'Delete Account' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });
});
