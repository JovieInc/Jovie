import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmailManagementCard } from './EmailManagementCard';
import type { ClerkEmailAddressResource, ClerkUserResource } from './types';

const hoisted = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  sync: vi.fn(async () => undefined),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: hoisted.success, error: hoisted.error }),
}));

vi.mock('./utils', async importOriginal => ({
  ...(await importOriginal<typeof import('./utils')>()),
  syncEmailToDatabase: hoisted.sync,
}));

function email(
  id: string,
  emailAddress: string,
  verified: boolean,
  overrides: Partial<ClerkEmailAddressResource> = {}
): ClerkEmailAddressResource {
  return {
    id,
    emailAddress,
    verification: { status: verified ? 'verified' : 'unverified' },
    prepareVerification: vi.fn(async () => undefined),
    attemptVerification: vi.fn(async () => ({
      ...email(id, emailAddress, true),
    })),
    destroy: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeUser(
  emails: ClerkEmailAddressResource[],
  overrides: Partial<ClerkUserResource> = {}
): ClerkUserResource {
  return {
    primaryEmailAddressId: emails[0]?.id ?? null,
    emailAddresses: emails,
    externalAccounts: [],
    createEmailAddress: vi.fn(async ({ email: address }) =>
      email('created', address, false)
    ),
    update: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    ...overrides,
  };
}

const primary = email('primary', 'artist@example.com', true);
const backup = email('backup', 'backup@example.com', true);
const unverified = email('pending', 'new@example.com', false);

describe('EmailManagementCard', () => {
  beforeEach(() => {
    hoisted.success.mockReset();
    hoisted.error.mockReset();
    hoisted.sync.mockClear();
  });

  it('lists addresses with their status and stays axe-clean', async () => {
    const { container } = render(
      <EmailManagementCard user={makeUser([primary, backup, unverified])} />
    );

    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getAllByText('Verified')).toHaveLength(2);
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Make primary' })
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('keeps a typed address and focus across a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const account = makeUser([primary]);
    const { rerender } = render(<EmailManagementCard user={account} />);

    const input = screen.getByLabelText('Add email address');
    await user.type(input, 'fan@example.com');
    rerender(<EmailManagementCard user={{ ...account }} />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Add email address')).toHaveValue(
      'fan@example.com'
    );
    expect(screen.getByLabelText('Add email address')).toHaveFocus();
  });

  it('sends a code, keeps the typed code across a rerender and verifies it', async () => {
    const user = userEvent.setup();
    const account = makeUser([primary]);
    const { rerender, container } = render(
      <EmailManagementCard user={account} />
    );

    await user.type(
      screen.getByLabelText('Add email address'),
      'fan@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(account.createEmailAddress).toHaveBeenCalledWith({
      email: 'fan@example.com',
    });
    const code = await screen.findByLabelText('Verification code');
    expect(hoisted.success).toHaveBeenCalledWith(
      'Verification code sent to fan@example.com'
    );
    await user.type(code, '123456');
    rerender(<EmailManagementCard user={{ ...account }} />);
    await user.keyboard('{Escape}');
    expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
    expect(screen.getByLabelText('Verification code')).toHaveFocus();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(account.update).toHaveBeenCalledWith({
        primaryEmailAddressId: 'created',
      })
    );
    expect(hoisted.sync).toHaveBeenCalledWith('fan@example.com');
    await waitFor(() =>
      expect(hoisted.success).toHaveBeenCalledWith('Primary email updated')
    );
  });

  it('cancels a pending verification back to the add form', async () => {
    const user = userEvent.setup();
    render(<EmailManagementCard user={makeUser([primary])} />);

    await user.type(
      screen.getByLabelText('Add email address'),
      'fan@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByLabelText('Verification code');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByLabelText('Add email address')).toHaveValue('');
  });

  it('shows the provider error and keeps the typed address', async () => {
    const user = userEvent.setup();
    const account = makeUser([primary], {
      createEmailAddress: vi.fn(async () => {
        throw new Error('That email address is taken.');
      }),
    });
    const { container } = render(<EmailManagementCard user={account} />);

    await user.type(
      screen.getByLabelText('Add email address'),
      'fan@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText('That email address is taken.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Add email address')).toHaveValue(
      'fan@example.com'
    );
    await expectNoA11yViolations(container);
  });

  it('makes a verified backup primary', async () => {
    const user = userEvent.setup();
    const account = makeUser([primary, backup]);
    render(<EmailManagementCard user={account} />);

    await user.click(screen.getByRole('button', { name: 'Make primary' }));

    await waitFor(() =>
      expect(account.update).toHaveBeenCalledWith({
        primaryEmailAddressId: 'backup',
      })
    );
    expect(hoisted.sync).toHaveBeenCalledWith('backup@example.com');
  });

  it('removes an address after confirming', async () => {
    const user = userEvent.setup();
    const account = makeUser([primary, backup]);
    render(<EmailManagementCard user={account} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByText(
        'This will remove backup@example.com from your account.'
      )
    ).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    await user.click(
      Array.from(dialog.querySelectorAll('button')).find(
        b => b.textContent === 'Remove'
      ) as HTMLButtonElement
    );

    await waitFor(() => expect(backup.destroy).toHaveBeenCalled());
    await waitFor(() =>
      expect(hoisted.success).toHaveBeenCalledWith('Email removed')
    );
  });

  it('renders the empty and right-to-left states axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <EmailManagementCard user={makeUser([])} />
      </div>
    );
    expect(screen.queryByText('Primary')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Add email address')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
