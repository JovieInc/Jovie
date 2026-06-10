import { describe, expect, it, vi } from 'vitest';
import { matchCommand } from '@/lib/chat/command-registry';

const router = { push: vi.fn() };

describe('chat command registry', () => {
  it('offers Apple Wallet only when the profile pass is available', () => {
    const command = matchCommand('add profile to apple wallet', {
      username: 'tim',
      appleWalletProfilePassAvailable: true,
      router,
    });

    expect(command?.confirmationMessage).toBe(
      'Opening Apple Wallet so your Jovie profile can be added for in-person scans.'
    );
  });

  it('keeps Apple Wallet unavailable when the flag or profile readiness fails', () => {
    const command = matchCommand('add profile to apple wallet', {
      username: 'tim',
      appleWalletProfilePassAvailable: false,
      router,
    });

    expect(command?.confirmationMessage).toBe(
      'Apple Wallet is not available for this profile yet.'
    );
  });
});
