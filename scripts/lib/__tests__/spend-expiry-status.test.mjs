import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../credentials-spend-check.mjs';
import {
  evaluateRegistry,
  validateSpendLedger,
} from '../credentials-registry.mjs';

const ledgerSchema = 'jovie.spend-ledger/v1';
const credentialSchema = 'jovie.credentials-registry/v1';
const bankedReset = '2026-10-29T19:10:07Z';
const afterDeadline = Date.parse('2026-11-07T00:00:00Z');

function codexFourthExpiry(status) {
  return evaluateRegistry({
    credentials: { schema: credentialSchema, credentials: [], stores: [] },
    spend: {
      schema: ledgerSchema,
      providers: [
        {
          id: 'codex-fourth',
          label: 'Codex subscription capacity: fourth (pro)',
          owner: 'gem-lanes',
          expiries: [
            {
              id: 'banked-reset-1',
              label: 'banked rate-limit reset redemption deadline',
              expiresAt: bankedReset,
              status,
            },
          ],
        },
      ],
    },
    nowMs: afterDeadline,
  });
}

function fourthExpiryFindings(status) {
  return codexFourthExpiry(status).findings.filter(item =>
    item.fingerprint.startsWith('spend-expiry:codex-fourth')
  );
}

describe('resolved spend expiries', () => {
  it('stops alerting once a dated spend expiry is resolved as lapsed', () => {
    expect(fourthExpiryFindings('lapsed')).toEqual([]);
  });

  it('stops alerting for redeemed and superseded spend expiries', () => {
    expect(fourthExpiryFindings('redeemed')).toEqual([]);
    expect(fourthExpiryFindings('superseded')).toEqual([]);
  });

  it('rejects an unknown spend expiry status instead of silently muting it', () => {
    expect(
      validateSpendLedger({
        schema: ledgerSchema,
        providers: [
          {
            id: 'codex-fourth',
            expiries: [
              {
                id: 'banked-reset-1',
                label: 'banked rate-limit reset redemption deadline',
                expiresAt: bankedReset,
                status: 'lapzed',
              },
            ],
          },
        ],
      })
    ).toEqual(['codex-fourth: banked-reset-1: unknown expiry status lapzed']);
  });

  it('still alerts when a dated spend expiry is explicitly active', () => {
    expect(fourthExpiryFindings('active').length).toBeGreaterThan(0);
  });
});

describe('committed registry', () => {
  const { credentials: creds, spend: ledger } = loadRegistry();

  it('records the lapsed codex-fourth banked reset instead of re-alerting forever', () => {
    const fourth = ledger.providers.find(
      provider => provider.id === 'codex-fourth'
    );
    expect(fourth?.expiries).toEqual([
      expect.objectContaining({ id: 'banked-reset-1', status: 'lapsed' }),
    ]);
    const { findings } = evaluateRegistry({
      credentials: creds,
      spend: ledger,
      nowMs: afterDeadline,
    });
    expect(
      findings.filter(item =>
        item.fingerprint.startsWith('spend-expiry:codex-fourth')
      )
    ).toEqual([]);
  });
});
