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

const now = 1_000_000;
const classify = (
  authPresent: boolean,
  cooldownUntil: number | null,
  readinessExpiresAt: number | null
) =>
  classifyCodexAccountState({
    authPresent,
    cooldownUntil,
    readinessExpiresAt,
    now,
  });

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
    expect(classifyCodexBinding('meetjovie')).toMatchObject({
      recognized: true,
      selectable: false,
    });
  });

  it('keeps verified, stale, unknown, and usage-exhausted states distinct', () => {
    expect(classify(true, now + 10, now + 10)).toBe('usage-exhausted');
    expect(classify(true, null, now - 1)).toBe('stale');
    expect(classify(false, null, null)).toBe('unknown');
    expect(classify(true, now - 1, now + 10)).toBe('verified');
  });

  it('parses inspect snapshots without leaking secrets and fills missing approved rows', () => {
    const parsed = parseCodexAccountControlSnapshot({
      schema: 'symphony-codex-account-control/v1',
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
        { label: 'meetjovie', state: 'usage-exhausted' },
        { label: 'personal', state: 'verified' },
      ],
      session: {
        id: 'abc',
        account: 'meetjovie',
        phase: 'succeeded',
        receipt: { account: 'meetjovie', completedAt: '2026-08-31T00:01:00Z' },
      },
    });
    expect(parsed?.accounts.map(row => row.label)).toEqual([
      'meetjovie',
      'jovie',
      'timwhite-co',
    ]);
    expect(parsed?.binding).toMatchObject({
      recognized: false,
      selectable: false,
      canSwitch: false,
    });
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
