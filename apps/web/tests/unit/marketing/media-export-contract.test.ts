import { describe, expect, it, vi } from 'vitest';
import {
  approveMarketingMediaExportReceipt,
  computeMarketingMediaExportCacheKey,
  executeMarketingMediaExportRequest,
  type MarketingMediaExportRequest,
  type ProduceMarketingMediaOutput,
  validateMarketingMediaExportRequest,
} from '@/data/marketing/mediaExport';

const base: MarketingMediaExportRequest = {
  fixtureId: 'homepage-header-bar',
  sourceRevision: 'GTcgO@eoUUU',
  recipeId: 'dark-glass',
  accentRef: '--noir-ion-shell',
  outputProfiles: ['still'],
  videoAvailable: true,
};
const ok: ProduceMarketingMediaOutput = () => ({ assetHash: 'hash-a' });

describe('validateMarketingMediaExportRequest', () => {
  it.each([
    ['malformed-request', { ...base, fixtureId: '' }],
    ['malformed-request', { ...base, outputProfiles: undefined }],
    ['malformed-request', { ...base, outputProfiles: ['still', 'still'] }],
    ['malformed-request', { ...base, outputProfiles: ['bogus'] }],
    ['malformed-request', { ...base, videoAvailable: 'yes' }],
    ['unknown-fixture', { ...base, fixtureId: 'nope' }],
    ['unknown-accent', { ...base, recipeId: 'flowing-accent' }],
    ['unknown-accent', { ...base, accentRef: '--wrong' }],
  ] as const)('rejects %s', (code, request) => {
    expect(
      validateMarketingMediaExportRequest(
        request as MarketingMediaExportRequest
      ).map(f => f.code)
    ).toContain(code);
  });

  it('accepts a registered fixture and reuses its recipe for a second fixture', () => {
    expect(validateMarketingMediaExportRequest(base)).toHaveLength(0);
    expect(
      validateMarketingMediaExportRequest({
        ...base,
        fixtureId: 'pricing-header-bar',
      })
    ).toHaveLength(0);
  });
});

describe('executeMarketingMediaExportRequest', () => {
  const approved = approveMarketingMediaExportReceipt(
    executeMarketingMediaExportRequest(base, ok),
    computeMarketingMediaExportCacheKey(base)
  );
  const failing: ProduceMarketingMediaOutput = () => ({
    error: 'render-failed',
  });

  it('reuses an approved receipt instead of re-invoking the renderer', () => {
    const produce = vi.fn(ok);
    const result = executeMarketingMediaExportRequest(base, produce, approved);
    expect(result.outputs).toEqual(approved.outputs);
    expect(produce).not.toHaveBeenCalled();
  });

  it('keeps retrying a failed profile instead of getting stuck on its fallback', () => {
    const changed = { ...base, sourceRevision: 'changed' };
    const produce = vi.fn(failing);
    const first = executeMarketingMediaExportRequest(
      changed,
      produce,
      approved
    );
    expect(first.outputs[0]).toEqual({
      profile: 'still',
      assetHash: 'hash-a',
      approved: true,
      fallback: true,
    });
    executeMarketingMediaExportRequest(changed, produce, first);
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed request without crashing on cache-key computation', () => {
    const request = {
      ...base,
      outputProfiles: undefined,
    } as unknown as MarketingMediaExportRequest;
    expect(
      executeMarketingMediaExportRequest(request, ok).findings[0]?.code
    ).toBe('malformed-request');
  });

  it('never reuses a fallback asset from a different fixture', () => {
    const request = { ...base, fixtureId: 'pricing-header-bar' };
    expect(
      executeMarketingMediaExportRequest(request, failing, approved).outputs
    ).toHaveLength(0);
  });

  it.each([
    ['render-timeout', () => ({ error: 'timeout' }) as const],
    [
      'provider-unavailable',
      () => ({ error: 'provider-unavailable' }) as const,
    ],
    [
      'render-failed',
      () => {
        throw new Error('boom');
      },
    ],
    ['render-failed', () => ({ assetHash: '' })],
  ] as const)('surfaces %s instead of a silent success', (code, produce) => {
    expect(
      executeMarketingMediaExportRequest(base, produce).findings[0]?.code
    ).toBe(code);
  });

  it('produces static outputs when the video provider is unavailable', () => {
    const request: MarketingMediaExportRequest = {
      ...base,
      outputProfiles: ['still', 'sequence'],
      videoAvailable: false,
    };
    const result = executeMarketingMediaExportRequest(request, ok);
    expect(result.outputs.map(o => o.profile)).toEqual(['still']);
    expect(result.findings[0]?.code).toBe('provider-unavailable');
  });
});

describe('approveMarketingMediaExportReceipt', () => {
  it('refuses to approve against a stale cache key', () => {
    const receipt = executeMarketingMediaExportRequest(base, ok);
    const approved = approveMarketingMediaExportReceipt(receipt, 'stale-key');
    expect(approved.findings.some(f => f.code === 'stale-approval-hash')).toBe(
      true
    );
    expect(approved.outputs.every(o => !o.approved)).toBe(true);
  });
});
