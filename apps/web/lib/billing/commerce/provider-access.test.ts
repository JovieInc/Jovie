import { describe, expect, it } from 'vitest';
import {
  ACCESS_RECEIPT_VERSION,
  evaluateProviderAccess,
  importProviderAccess,
  type ProviderAccessReceipt,
} from './provider-access';

const NOW = new Date('2026-10-15T18:00:00Z');
const request = {
  provider: 'stripe',
  account: 'stripe-jovie',
  capability: 'ordinary-web-checkout',
} as const;
function receipt(
  overrides: Partial<ProviderAccessReceipt> = {}
): ProviderAccessReceipt {
  return {
    ...request,
    resource: null,
    environment: 'live',
    result: 'GRANTED',
    observedAt: '2026-10-15T17:00:00Z',
    expiresAt: '2026-10-16T17:00:00Z',
    source: 'account-api',
    verification: 'verified',
    evidenceRef: 'private-receipt:checkout',
    sku: null,
    ...overrides,
  };
}
function imported(receipts: ProviderAccessReceipt[]) {
  return importProviderAccess({ version: ACCESS_RECEIPT_VERSION, receipts });
}
const evaluate = (receipts: ProviderAccessReceipt[]) =>
  evaluateProviderAccess(imported(receipts), request, NOW);

describe('provider account evidence', () => {
  it('retains provider/account/capability/time/expiry and verified access result', () => {
    expect(evaluate([receipt()])).toMatchObject({
      ...request,
      observedAt: '2026-10-15T17:00:00Z',
      expiresAt: '2026-10-16T17:00:00Z',
      result: 'GRANTED',
    });
    expect(evaluate([receipt({ result: 'DENIED' })]).result).toBe('DENIED');
    expect(evaluate([receipt({ result: 'UNKNOWN' })]).result).toBe('UNKNOWN');
  });

  it('fails closed without credentials/receipts or a known account', () => {
    expect(
      evaluateProviderAccess(importProviderAccess(null), request, NOW).result
    ).toBe('UNKNOWN');
    expect(evaluate([]).result).toBe('UNKNOWN');
    expect(
      evaluateProviderAccess(
        imported([receipt()]),
        { ...request, account: null },
        NOW
      ).result
    ).toBe('UNKNOWN');
  });

  it.each([
    { account: 'another-account' },
    { provider: 'openai' },
    { environment: 'test' },
    { capability: 'spt' },
    { resource: 'other-resource' },
    { verification: 'unverifiable', source: 'dashboard' },
    { source: 'unavailable' },
    { evidenceRef: null },
    { observedAt: '2026-10-15T18:00:01Z' },
    { expiresAt: '2026-10-15T18:00:00Z' },
    { expiresAt: '2026-10-15T16:00:00Z' },
    { expiresAt: '2026-10-17T17:00:00Z' },
    { observedAt: '2026-10-14T17:00:00Z' },
  ] satisfies Array<Partial<ProviderAccessReceipt>>)(
    'does not infer access from %j',
    overrides => {
      expect(evaluate([receipt(overrides)]).result).toBe('UNKNOWN');
    }
  );

  it('accepts a verified dashboard export but never a dashboard guess', () => {
    expect(evaluate([receipt({ source: 'dashboard' })]).result).toBe('GRANTED');
    expect(
      evaluate([receipt({ source: 'dashboard', verification: 'unverifiable' })])
        .result
    ).toBe('UNKNOWN');
  });

  it('does not resurrect an older grant after denial, expiry or unverifiable evidence', () => {
    const older = receipt({
      observedAt: '2026-10-15T16:00:00Z',
      expiresAt: '2026-10-16T16:00:00Z',
    });
    expect(evaluate([receipt({ result: 'DENIED' }), older]).result).toBe(
      'DENIED'
    );
    expect(
      evaluate([older, receipt({ expiresAt: '2026-10-15T18:00:00Z' })]).result
    ).toBe('UNKNOWN');
    expect(
      evaluate([receipt({ verification: 'unverifiable' }), older]).result
    ).toBe('UNKNOWN');
  });

  it('rejects conflicting simultaneous receipts regardless of import order', () => {
    const receipts = [receipt(), receipt({ result: 'DENIED' })];
    expect(evaluate(receipts)).toEqual(evaluate([...receipts].reverse()));
    expect(evaluate(receipts)).toMatchObject({
      result: 'UNKNOWN',
      reason: 'conflicting-observations',
    });
    expect(evaluate([receipt(), receipt()]).result).toBe('GRANTED');
  });

  it('uses content revisions and rejects malformed/credential-bearing imports without echoing them', () => {
    const receipts = [receipt(), receipt({ capability: 'spt' })];
    expect(imported(receipts).revision).toBe(
      imported([...receipts].reverse()).revision
    );
    expect(imported(receipts).revision).not.toBe(
      imported([receipt({ result: 'DENIED' })]).revision
    );
    const invalid = importProviderAccess({
      version: ACCESS_RECEIPT_VERSION,
      receipts: [{ ...receipt(), credential: 'private-value' }],
    });
    expect(invalid.valid).toBe(false);
    expect(JSON.stringify(invalid)).not.toContain('private-value');
    expect(evaluateProviderAccess(invalid, request, NOW).result).toBe(
      'UNKNOWN'
    );
  });

  it('requires a real evaluation clock', () => {
    expect(() =>
      evaluateProviderAccess(imported([]), request, new Date('invalid'))
    ).toThrow('Invalid access evaluation clock');
  });
});
