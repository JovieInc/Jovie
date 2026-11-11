import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../credentials-spend-check.mjs';
import {
  evaluateRegistry,
  validateSpendLedger,
} from '../credentials-registry.mjs';

const ledgerSchema = 'jovie.spend-ledger/v1';
const credentialSchema = 'jovie.credentials-registry/v1';
// The committed registry drained around this date (JOV-10239): the lanes
// live read paged 0.1 days of runway on 2026-11-08 and 0 days after.
const afterDrain = Date.parse('2026-11-08T12:00:00Z');

function gatewayEntry(overrides = {}) {
  return {
    id: 'vercel-ai-gateway-credits',
    label: 'Vercel AI Gateway credit balance (team jovie)',
    owner: 'tim',
    snapshot: { observedAt: '2026-11-08T00:00:00Z', balanceUsd: 0.2 },
    burnPerDayUsd: {
      value: 2.04,
      source: 'declared',
      observedAt: '2026-11-08T00:00:00Z',
    },
    ...overrides,
  };
}

function gatewayRunwayFindings(providers) {
  const { findings } = evaluateRegistry({
    credentials: { schema: credentialSchema, credentials: [], stores: [] },
    spend: { schema: ledgerSchema, providers },
    nowMs: afterDrain,
  });
  return findings
    .filter(item => item.fingerprint.startsWith('spend-runway'))
    .map(item => item.fingerprint)
    .sort();
}

describe('resolved spend runway', () => {
  it('stops alerting and paging once a drained pool records runwayStatus drained', () => {
    expect(
      gatewayRunwayFindings([gatewayEntry({ runwayStatus: 'drained' })])
    ).toEqual([]);
  });

  it('still alerts and pages a low-balance pool without a resolved runway status', () => {
    expect(gatewayRunwayFindings([gatewayEntry()])).toEqual([
      'spend-runway-page:vercel-ai-gateway-credits',
      'spend-runway:vercel-ai-gateway-credits',
    ]);
  });

  it('rejects an unknown runway status instead of silently muting the pool', () => {
    expect(
      validateSpendLedger({
        schema: ledgerSchema,
        providers: [gatewayEntry({ runwayStatus: 'draineed' })],
      })
    ).toEqual(['vercel-ai-gateway-credits: unknown runway status draineed']);
  });
});

describe('committed registry', () => {
  const { credentials, spend } = loadRegistry();

  it('records the drained gateway pool instead of re-paging runway forever', () => {
    const gateway = spend.providers.find(
      provider => provider.id === 'vercel-ai-gateway-credits'
    );
    expect(gateway?.runwayStatus).toBe('drained');
    const { findings } = evaluateRegistry({
      credentials,
      spend,
      nowMs: afterDrain,
    });
    expect(
      findings
        .filter(item =>
          item.fingerprint.startsWith('spend-runway:vercel-ai-gateway-credits')
        )
        .map(item => item.fingerprint)
    ).toEqual([]);
    expect(
      findings.filter(item =>
        item.fingerprint.startsWith(
          'spend-runway-page:vercel-ai-gateway-credits'
        )
      )
    ).toEqual([]);
  });

  it('keeps the drained line visible in the spend rows', () => {
    const { spend: rows } = evaluateRegistry({
      credentials,
      spend,
      nowMs: afterDrain,
    });
    const row = rows.find(item => item.id === 'vercel-ai-gateway-credits');
    expect(row).toMatchObject({
      owner: 'tim',
      balanceUsd: 4.27,
      burnPerDayUsd: 0.59,
    });
  });
});
