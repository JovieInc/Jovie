import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ unlock: vi.fn(), assign: vi.fn() }));
vi.mock('@/lib/workspace-lock/unlock-with-passkey', () => ({
  unlockWithPasskey: m.unlock,
}));
vi.mock('@/features/auth', () => ({
  AuthLayout: ({
    children,
    formTitle,
  }: {
    children: React.ReactNode;
    formTitle: string;
  }) => (
    <div>
      <h1>{formTitle}</h1>
      {children}
    </div>
  ),
}));

import { OvieConnectVerification } from './OvieConnectVerification';

const next = '/api/ovie/oauth/authorize?state=opaque&code_challenge=original';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign: m.assign });
});

describe('Ovie reconnect passkey action', () => {
  it('resumes the exact server-provided authorization path only after confirmation', async () => {
    m.unlock.mockResolvedValue(undefined);
    render(<OvieConnectVerification authorizePath={next} purpose='admin' />);
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Verify with passkey' })
      )
    );
    expect(m.unlock).toHaveBeenCalledWith({
      purpose: 'admin',
      allowEnrollment: false,
    });
    expect(m.assign).toHaveBeenCalledWith(next);
  });
  it.each([
    'The passkey prompt was canceled.',
    'That device passkey cannot unlock admin access.',
    'Verification timed out.',
    'Could not confirm the unlock.',
  ])('preserves the request and offers retry after %s', async message => {
    m.unlock.mockRejectedValue(new Error(message));
    render(<OvieConnectVerification authorizePath={next} purpose='admin' />);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button')).toBeEnabled();
    expect(m.assign).not.toHaveBeenCalled();
    m.unlock.mockResolvedValue(undefined);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(m.assign).toHaveBeenCalledWith(next);
  });
  it('keeps a single disabled pending action while the ceremony is active', async () => {
    m.unlock.mockReturnValue(new Promise(() => {}));
    render(<OvieConnectVerification authorizePath={next} purpose='privacy' />);
    fireEvent.click(screen.getByRole('button'));
    expect(
      screen.getByRole('button', { name: 'Waiting for passkey…' })
    ).toBeDisabled();
    expect(m.unlock).toHaveBeenCalledWith({
      purpose: 'privacy',
      allowEnrollment: false,
    });
    expect(m.assign).not.toHaveBeenCalled();
  });
});
