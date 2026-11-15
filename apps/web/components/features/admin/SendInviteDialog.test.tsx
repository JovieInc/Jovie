import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SendInviteDialog } from './SendInviteDialog';

const { mutateAsync, mutationState } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  mutationState: { isPending: false },
}));

vi.mock('@/lib/queries', () => ({
  useCreateInviteMutation: () => ({
    mutateAsync,
    isPending: mutationState.isPending,
  }),
}));

const profile = {
  id: 'profile-1',
  username: 'ava',
  displayName: 'Ava',
  avatarUrl: null,
} as AdminCreatorProfileRow;

function renderDialog(
  overrides: Partial<Parameters<typeof SendInviteDialog>[0]> = {}
) {
  const props = {
    profile,
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SendInviteDialog {...props} />) };
}

describe('SendInviteDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutationState.isPending = false;
  });

  it('moves focus to the email field on open', async () => {
    renderDialog();

    const email = screen.getByRole('textbox');
    await waitFor(() => expect(email).toHaveFocus());
    expect(screen.getByText('Ava')).toBeInTheDocument();
    expect(screen.getByText('@ava')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Invite' })
    ).toBeDisabled();
    await expectNoA11yViolations(document.body);
  });

  it('renders nothing without a profile', () => {
    renderDialog({ profile: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the typed email and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();

    await user.type(screen.getByRole('textbox'), 'ava@example.com');
    rerender(<SendInviteDialog {...props} />);

    expect(screen.getByRole('textbox')).toHaveValue('ava@example.com');
    expect(screen.getByRole('textbox')).toHaveFocus();
    screen.getByRole('textbox').blur();
    expect(screen.getByRole('textbox')).toHaveValue('ava@example.com');
  });

  it('rejects an invalid email without calling the server', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole('textbox'), 'ava@example');
    await user.click(screen.getByRole('button', { name: 'Create Invite' }));

    expect(
      await screen.findByText('Please enter a valid email address')
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('ava@example');
    await expectNoA11yViolations(document.body);
  });

  it('shows the server error and keeps the email', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error('Profile is already claimed'));
    renderDialog();

    await user.type(screen.getByRole('textbox'), 'ava@example.com');
    await user.click(screen.getByRole('button', { name: 'Create Invite' }));

    expect(
      await screen.findByText('Profile is already claimed')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('ava@example.com');
    await expectNoA11yViolations(document.body);
  });

  it('creates the invite, confirms it and closes after a pause', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ success: true });
    const { props } = renderDialog();

    await user.type(screen.getByRole('textbox'), ' Ava@Example.com ');
    await user.click(screen.getByRole('button', { name: 'Create Invite' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      creatorProfileId: 'profile-1',
      email: 'ava@example.com',
    });
    expect(
      await screen.findByText('Invite created successfully!')
    ).toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    await expectNoA11yViolations(document.body);

    await waitFor(
      () => expect(props.onOpenChange).toHaveBeenCalledWith(false),
      { timeout: 3000 }
    );
    expect(props.onSuccess).toHaveBeenCalledTimes(1);
  });

  it('locks the form while the invite is being created', async () => {
    mutationState.isPending = true;
    const { props } = renderDialog();

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    await expectNoA11yViolations(document.body);
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('clears the form when the person cancels', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByRole('textbox'), 'ava@example.com');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
