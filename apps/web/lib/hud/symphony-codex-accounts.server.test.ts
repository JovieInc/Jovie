import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import {
  inspectSymphonyCodexAccounts,
  reconnectSymphonyCodexAccount,
} from './symphony-codex-accounts.server';

const READY = {
  schema: 'symphony-codex-account-control/v1',
  service: 'symphony-elixir.service',
  observedAt: '2026-08-31T00:00:00Z',
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inspects through the injected runner and keeps unrecognized bindings unselectable', async () => {
    const runner = vi.fn().mockResolvedValue({
      status: 0,
      stdout: JSON.stringify(READY),
    });
    const snapshot = await inspectSymphonyCodexAccounts(runner);
    expect(runner).toHaveBeenCalledWith(['inspect'], 8_000);
    expect(snapshot.accounts.map(row => row.label)).toEqual([
      'meetjovie',
      'jovie',
      'timwhite-co',
    ]);
    expect(snapshot.binding.recognized).toBe(false);
    expect(snapshot.binding.selectable).toBe(false);
  });

  it('fails closed when the runner is unavailable and never restarts the service', async () => {
    const snapshot = await inspectSymphonyCodexAccounts(async () => ({
      status: 1,
      stdout: 'systemctl restart symphony-elixir.service token=secret',
    }));
    expect(snapshot.availability).toBe('unavailable');
    expect(snapshot.accounts).toHaveLength(3);
    expect(JSON.stringify(snapshot)).not.toContain('secret');
    expect(JSON.stringify(snapshot)).not.toContain('restart');
  });

  it('reconnects only an approved account through the helper argv', async () => {
    const runner = vi.fn().mockResolvedValue({
      status: 0,
      stdout: JSON.stringify({
        ...READY,
        session: {
          id: 'sess',
          account: 'meetjovie',
          phase: 'authorization-pending',
          userCode: 'ABCD-1234',
          verificationUri: 'https://auth.openai.com/codex/device',
          createdAt: '2026-08-31T00:00:00Z',
          expiresAt: '2026-08-31T00:10:00Z',
          receipt: null,
        },
      }),
    });
    const snapshot = await reconnectSymphonyCodexAccount('meetjovie', runner);
    expect(runner).toHaveBeenCalledWith(
      ['reconnect', '--account', 'meetjovie'],
      12_000
    );
    expect(snapshot.session?.phase).toBe('authorization-pending');
    expect(snapshot.session?.account).toBe('meetjovie');
  });
});
