import { describe, expect, it } from 'vitest';
import {
  APPROVED_CODEX_ACCOUNT_LABELS,
  classifyCodexAccountState,
  classifyCodexBinding,
  emptyCodexAccountControlSnapshot,
  parseCodexAccountControlSnapshot,
  reconnectPhaseFromSnapshot,
  SYMPHONY_CODEX_ACCOUNT_OPTIMIZATION_EXCEPTION,
  stripCodexAccountSecrets,
} from './symphony-codex-accounts';

describe('symphony-codex-accounts', () => {
  it('lists only founder-approved labels and keeps unrecognized bindings unselectable', () => {
    expect([...APPROVED_CODEX_ACCOUNT_LABELS]).toEqual([
      'meetjovie',
      'jovie',
      'timwhite-co',
    ]);
    expect(classifyCodexBinding('personal')).toEqual({
      recognized: false,
      selectable: false,
      canSwitch: false,
      canRestart: false,
    });
    expect(classifyCodexBinding('meetjovie').recognized).toBe(true);
    expect(classifyCodexBinding('meetjovie').selectable).toBe(false);
  });

  it('keeps verified, stale, unknown, and usage-exhausted states distinct', () => {
    const now = 1_000_000;
    expect(
      classifyCodexAccountState({
        authPresent: true,
        cooldownUntil: now + 10,
        readinessExpiresAt: now + 10,
        now,
      })
    ).toBe('usage-exhausted');
    expect(
      classifyCodexAccountState({
        authPresent: true,
        cooldownUntil: null,
        readinessExpiresAt: now - 1,
        now,
      })
    ).toBe('stale');
    expect(
      classifyCodexAccountState({
        authPresent: false,
        cooldownUntil: null,
        readinessExpiresAt: null,
        now,
      })
    ).toBe('unknown');
    expect(
      classifyCodexAccountState({
        authPresent: true,
        cooldownUntil: now - 1,
        readinessExpiresAt: now + 10,
        now,
      })
    ).toBe('verified');
  });

  it('parses inspect snapshots without leaking secrets and fills missing approved rows', () => {
    const parsed = parseCodexAccountControlSnapshot({
      schema: 'symphony-codex-account-control/v1',
      service: 'symphony-elixir.service',
      observedAt: '2026-08-31T00:00:00Z',
      availability: 'ready',
      binding: {
        boundLabel: 'personal',
        recognized: true,
        selectable: true,
        canSwitch: true,
        canRestart: true,
        serviceActive: true,
      },
      accounts: [
        {
          label: 'meetjovie',
          state: 'usage-exhausted',
          reconnectEligible: true,
        },
        { label: 'personal', state: 'verified', reconnectEligible: true },
      ],
      session: {
        id: 'abc',
        account: 'meetjovie',
        phase: 'succeeded',
        userCode: 'ABCD-1234',
        verificationUri: 'https://auth.openai.com/codex/device',
        createdAt: '2026-08-31T00:00:00Z',
        expiresAt: '2026-08-31T00:10:00Z',
        receipt: {
          account: 'meetjovie',
          completedAt: '2026-08-31T00:01:00Z',
        },
      },
    });
    expect(parsed?.accounts.map(row => row.label)).toEqual([
      'meetjovie',
      'jovie',
      'timwhite-co',
    ]);
    expect(parsed?.binding.recognized).toBe(false);
    expect(parsed?.binding.selectable).toBe(false);
    expect(parsed?.binding.canSwitch).toBe(false);
    expect(parsed?.session?.receipt?.result).toBe('selected-account-verified');
    expect(
      stripCodexAccountSecrets(
        'token=secret-live access_token=redacted-token-material'
      )
    ).not.toMatch(/secret-live|redacted-token-material/);
    expect(SYMPHONY_CODEX_ACCOUNT_OPTIMIZATION_EXCEPTION.class).toBe(
      'non-product'
    );
  });

  it('maps confirmation and session phases for the reserved status region', () => {
    const snapshot = emptyCodexAccountControlSnapshot('unavailable', 'down');
    expect(reconnectPhaseFromSnapshot(snapshot, 'jovie')).toBe('confirmation');
    expect(reconnectPhaseFromSnapshot(snapshot, null)).toBe('idle');
  });
});
