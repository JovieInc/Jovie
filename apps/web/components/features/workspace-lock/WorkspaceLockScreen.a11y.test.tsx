import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WorkspaceLockScreen } from './WorkspaceLockScreen';

const client = vi.hoisted(() => ({
  listUserPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  signInPasskey: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: client.listUserPasskeys,
      addPasskey: client.addPasskey,
    },
    signIn: { passkey: client.signInPasskey },
  },
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  isDesktopEnvironment: () => false,
  openCurrentOvieInBrowser: vi.fn(async () => ({ ok: true })),
}));

Object.defineProperty(window, 'PublicKeyCredential', {
  configurable: true,
  value: Object.assign(function PublicKeyCredential() {}, {
    isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
  }),
});
Object.defineProperty(navigator, 'credentials', {
  configurable: true,
  value: { get: vi.fn(), create: vi.fn() },
});

afterEach(() => {
  vi.clearAllMocks();
});

const LONG_REASON =
  'The passkey offered by your password manager is not registered to this account, so the workspace stays locked until you choose a passkey that was set up for this Ovie account.';

async function failUnlock(message: string) {
  client.listUserPasskeys.mockResolvedValue({
    data: [{ id: 'pk1' }],
    error: null,
  });
  client.signInPasskey.mockResolvedValue({ data: null, error: { message } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Unlock with passkey' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  );
}

describe('WorkspaceLockScreen accessibility', () => {
  it('has no axe violations while locked', async () => {
    const { container } = render(<WorkspaceLockScreen />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps the action and announces a failed unlock accessibly', async () => {
    const { container } = render(<WorkspaceLockScreen />);
    await failUnlock('Passkey denied');
    expect(
      screen.getByRole('button', { name: 'Unlock with passkey' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('announces a long failure reason in full', async () => {
    const { container } = render(
      <div className='w-64'>
        <WorkspaceLockScreen />
      </div>
    );
    await failUnlock(LONG_REASON);
    expect(screen.getByTestId('workspace-lock-status')).toHaveTextContent(
      LONG_REASON
    );
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WorkspaceLockScreen />
      </div>
    );
    expect(
      screen.getByRole('region', { name: 'Ovie Privacy Lock' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
