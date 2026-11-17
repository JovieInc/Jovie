import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ConnectedAccountsCard } from './ConnectedAccountsCard';
import type { ClerkExternalAccountResource, ClerkUserResource } from './types';

const { success, error } = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success, error }),
}));

const account = (
  overrides: Partial<ClerkExternalAccountResource>
): ClerkExternalAccountResource => ({
  id: 'ext-google',
  provider: 'oauth_google',
  emailAddress: 'tim@example.com',
  verification: { status: 'verified' },
  destroy: vi.fn(async () => undefined),
  ...overrides,
});

const user = (
  externalAccounts: ClerkExternalAccountResource[]
): ClerkUserResource => ({
  primaryEmailAddressId: null,
  emailAddresses: [],
  externalAccounts,
  createEmailAddress: vi.fn(),
  update: vi.fn(),
  reload: vi.fn(),
});

async function confirmDisconnect(
  userSetup: ReturnType<typeof userEvent.setup>
) {
  await userSetup.click(screen.getByRole('button', { name: 'Disconnect' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByText(
      'This will disconnect Google from your account. You can reconnect it later.'
    )
  ).toBeInTheDocument();
  await userSetup.click(
    within(dialog).getByRole('button', { name: 'Disconnect' })
  );
}

beforeEach(() => {
  success.mockReset();
  error.mockReset();
});

describe('ConnectedAccountsCard certificate', () => {
  it('disconnects a provider after confirmation', async () => {
    const userSetup = userEvent.setup();
    const google = account({});
    const { container } = render(
      <ConnectedAccountsCard user={user([google])} />
    );

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await confirmDisconnect(userSetup);

    await waitFor(() => expect(google.destroy).toHaveBeenCalledOnce());
    expect(success).toHaveBeenCalledWith('Google disconnected');
    expect(
      await screen.findByText('No connected accounts yet.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the provider and reports the error when disconnect fails', async () => {
    const userSetup = userEvent.setup();
    const google = account({
      destroy: vi.fn(async () => {
        throw new Error('Could not disconnect Google. Try again.');
      }),
    });
    const { container } = render(
      <ConnectedAccountsCard user={user([google])} />
    );

    await confirmDisconnect(userSetup);

    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(screen.getByText('tim@example.com')).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('labels providers by username, name or a fallback', async () => {
    const { container } = render(
      <ConnectedAccountsCard
        user={user([
          account({
            id: 'a',
            provider: 'oauth_spotify',
            emailAddress: undefined,
            username: 'timwhite',
            verification: null,
          }),
          account({
            id: 'b',
            provider: 'oauth_custom_idp',
            emailAddress: undefined,
            firstName: 'Ada',
            lastName: 'Artist',
          }),
          account({ id: 'c', provider: 'github', emailAddress: undefined }),
        ])}
      />
    );

    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('timwhite')).toBeInTheDocument();
    expect(screen.getByText('custom_idp')).toBeInTheDocument();
    expect(screen.getByText('Ada Artist')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders empty and RTL states accessibly', async () => {
    const empty = render(<ConnectedAccountsCard user={user([])} />);
    expect(screen.getByText('No connected accounts yet.')).toBeInTheDocument();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const rtl = render(
      <div dir='rtl'>
        <ConnectedAccountsCard user={user([account({})])} />
      </div>
    );
    expect(screen.getByText('Google')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
