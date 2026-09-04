import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import {
  inspectSymphonyCodexAccounts,
  reconnectSymphonyCodexAccount,
} from './symphony-codex-accounts.server';

const READY = {
  schema: 'symphony-codex-account-control/v1',
  availability: 'ready',
  binding: {
    boundLabel: 'personal',
    recognized: false,
    selectable: false,
    canSwitch: false,
    canRestart: false,
    reviewOnly: true,
    serviceActive: true,
  },
  accounts: [
    { label: 'meetjovie', state: 'usage-exhausted', reconnectEligible: true },
    { label: 'jovie', state: 'stale', reconnectEligible: true },
    { label: 'timwhite-co', state: 'unknown', reconnectEligible: true },
  ],
  session: null,
};

describe('symphony-codex-accounts.server', () => {
  it('inspects, fails closed, and reconnects without restarting the service', async () => {
    const runner = vi
      .fn()
      .mockResolvedValue({ status: 0, stdout: JSON.stringify(READY) });
    const snapshot = await inspectSymphonyCodexAccounts(runner);
    expect(runner).toHaveBeenCalledWith(['inspect'], 8_000);
    expect(snapshot.accounts.map(row => row.label)).toEqual([
      'meetjovie',
      'jovie',
      'timwhite-co',
    ]);
    expect(snapshot.binding).toMatchObject({
      recognized: false,
      selectable: false,
    });
    const failed = await inspectSymphonyCodexAccounts(async () => ({
      status: 1,
      stdout: 'systemctl restart symphony-elixir.service token=secret',
    }));
    expect(failed.availability).toBe('unavailable');
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect(JSON.stringify(failed)).not.toContain('restart');
    runner.mockResolvedValue({
      status: 0,
      stdout: JSON.stringify({
        ...READY,
        session: {
          id: 'sess',
          account: 'meetjovie',
          phase: 'authorization-pending',
          userCode: 'ABCD-1234',
          receipt: null,
        },
      }),
    });
    const reconnected = await reconnectSymphonyCodexAccount(
      'meetjovie',
      runner
    );
    expect(runner).toHaveBeenCalledWith(
      ['reconnect', '--account', 'meetjovie'],
      12_000
    );
    expect(reconnected.session).toMatchObject({
      phase: 'authorization-pending',
      account: 'meetjovie',
    });
  });
});
