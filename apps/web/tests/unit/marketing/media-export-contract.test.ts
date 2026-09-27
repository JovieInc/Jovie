import { describe, expect, it, vi } from 'vitest';
import {
  approveMarketingMediaExportReceipt,
  computeMarketingMediaExportCacheKey,
  executeMarketingMediaExportRequest,
  formatMarketingMediaExportRequestForPrompt,
  MARKETING_MEDIA_EXPORT_FIXTURES,
  type MarketingMediaExportOutputResult,
  type MarketingMediaExportRequest,
  validateMarketingMediaExportRequest,
} from '@/data/marketing';

function codes(
  findings: readonly { readonly code: string }[]
): readonly string[] {
  return findings.map(f => f.code);
}

const [homepageFixture, pricingFixture] = MARKETING_MEDIA_EXPORT_FIXTURES;

function baseRequest(
  overrides: Partial<MarketingMediaExportRequest> = {}
): MarketingMediaExportRequest {
  return {
    fixtureId: homepageFixture.id,
    sourceRevision: 'src-rev-1',
    recipeId: homepageFixture.recipeId,
    accentToken: homepageFixture.accentToken,
    outputProfiles: ['still', 'poster', 'sequence'],
    rendererVersion: 'renderer-1',
    tokenPolicyVersion: 'scene-palette-v1',
    fallbackPolicy: 'retain-last-approved',
    ...overrides,
  };
}

const okOutput = (
  overrides: Partial<
    Extract<MarketingMediaExportOutputResult, { ok: true }>
  > = {}
): MarketingMediaExportOutputResult => ({
  ok: true,
  assetHash: 'hash-1',
  width: 1440,
  height: 900,
  format: 'image/png',
  rightsProvenance: 'jovie-owned',
  ...overrides,
});

describe('marketing media export contract (JOV-6250)', () => {
  it('produces a still, poster and sequence from one approved fixture with an intelligible receipt', () => {
    const produceOutput = vi.fn((profile: string) =>
      okOutput({ assetHash: `hash-${profile}`, format: 'image/png' })
    );

    const result = executeMarketingMediaExportRequest({
      request: baseRequest(),
      produceOutput,
    });

    expect(result.status).toBe('executed');
    if (result.status !== 'executed') throw new Error('unreachable');
    expect(result.receipt.outputs.map(o => o.profile)).toEqual([
      'still',
      'poster',
      'sequence',
    ]);
    expect(result.receipt.approved).toBe(false);
    expect(result.receipt.recipeId).toBe('dark-glass');
    expect(result.receipt.receiptDigest).toContain('still:hash-still');
    expect(produceOutput).toHaveBeenCalledTimes(3);
  });

  it('lets a second approved fixture reuse the same recipe with no new component', () => {
    expect(pricingFixture.recipeId).toBe(homepageFixture.recipeId);
    expect(pricingFixture.componentId).toBe(homepageFixture.componentId);
    expect(pricingFixture.id).not.toBe(homepageFixture.id);

    const result = executeMarketingMediaExportRequest({
      request: baseRequest({
        fixtureId: pricingFixture.id,
        accentToken: pricingFixture.accentToken,
        outputProfiles: ['still'],
      }),
      produceOutput: () => okOutput(),
    });

    expect(result.status).toBe('executed');
  });

  it('reuses an approved receipt for a repeated unchanged request without re-invoking the renderer', () => {
    const produceOutput = vi.fn(() => okOutput());
    const request = baseRequest({ outputProfiles: ['still'] });

    const first = executeMarketingMediaExportRequest({
      request,
      produceOutput,
    });
    if (first.status !== 'executed') throw new Error('unreachable');

    const approval = approveMarketingMediaExportReceipt(first.receipt, {
      approvedReceiptDigest: first.receipt.receiptDigest,
      approvalEvidenceId: 'evidence-1',
    });
    expect(approval.ok).toBe(true);
    if (!approval.ok) throw new Error('unreachable');

    produceOutput.mockClear();
    const second = executeMarketingMediaExportRequest({
      request,
      existingReceipt: approval.receipt,
      produceOutput,
    });

    expect(second.status).toBe('reused');
    expect(produceOutput).not.toHaveBeenCalled();
  });

  it('invalidates only the descendant whose source/token actually changed', () => {
    const unchanged = baseRequest({ outputProfiles: ['still'] });
    const changedSource = baseRequest({
      outputProfiles: ['still'],
      sourceRevision: 'src-rev-2',
    });
    const otherFixture = baseRequest({
      fixtureId: pricingFixture.id,
      accentToken: pricingFixture.accentToken,
      outputProfiles: ['still'],
    });

    const unchangedKey = computeMarketingMediaExportCacheKey(unchanged);
    expect(computeMarketingMediaExportCacheKey(changedSource)).not.toBe(
      unchangedKey
    );
    expect(computeMarketingMediaExportCacheKey(otherFixture)).not.toBe(
      unchangedKey
    );

    const produceOutput = vi.fn(() => okOutput());
    const approvedFirst = executeMarketingMediaExportRequest({
      request: unchanged,
      produceOutput,
    });
    if (approvedFirst.status !== 'executed') throw new Error('unreachable');
    const approval = approveMarketingMediaExportReceipt(approvedFirst.receipt, {
      approvedReceiptDigest: approvedFirst.receipt.receiptDigest,
      approvalEvidenceId: 'evidence-1',
    });
    if (!approval.ok) throw new Error('unreachable');

    produceOutput.mockClear();
    const staleCacheResult = executeMarketingMediaExportRequest({
      request: changedSource,
      existingReceipt: approval.receipt,
      produceOutput,
    });
    expect(staleCacheResult.status).toBe('executed');
    expect(produceOutput).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed requests with actionable findings', () => {
    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ sourceRevision: '  ', outputProfiles: [] })
        )
      )
    ).toEqual(
      expect.arrayContaining([
        'missing-source-revision',
        'empty-output-profiles',
      ])
    );
  });

  it('rejects unknown fixtures, unknown recipes and accent mismatches', () => {
    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ fixtureId: 'not-registered' })
        )
      )
    ).toContain('unknown-fixture');

    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ recipeId: 'neon-prism' })
        )
      )
    ).toContain('unknown-media-recipe');

    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ accentToken: '--made-up-accent' })
        )
      )
    ).toContain('accent-mismatch');

    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ outputProfiles: ['still', 'holographic'] })
        )
      )
    ).toContain('unsupported-output-profile');

    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ fallbackPolicy: 'improvise' })
        )
      )
    ).toContain('unsupported-fallback-policy');

    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({
            fallbackPolicy: 'static-only',
            outputProfiles: ['still', 'sequence'],
          })
        )
      )
    ).toContain('static-only-excludes-sequence');

    expect(
      codes(
        validateMarketingMediaExportRequest(
          baseRequest({ outputProfiles: ['still', 'still'] })
        )
      )
    ).toContain('duplicate-output-profile');
  });

  it('rejects approval against a stale or missing receipt digest', () => {
    const request = baseRequest({ outputProfiles: ['still'] });
    const executed = executeMarketingMediaExportRequest({
      request,
      produceOutput: () => okOutput(),
    });
    if (executed.status !== 'executed') throw new Error('unreachable');

    const staleApproval = approveMarketingMediaExportReceipt(executed.receipt, {
      approvedReceiptDigest: 'not-the-real-digest',
      approvalEvidenceId: 'evidence-1',
    });
    expect(staleApproval.ok).toBe(false);
    if (staleApproval.ok) throw new Error('unreachable');
    expect(codes(staleApproval.findings)).toEqual(['stale-approval-hash']);

    const missingEvidence = approveMarketingMediaExportReceipt(
      executed.receipt,
      {
        approvedReceiptDigest: executed.receipt.receiptDigest,
        approvalEvidenceId: '  ',
      }
    );
    expect(missingEvidence.ok).toBe(false);
    if (missingEvidence.ok) throw new Error('unreachable');
    expect(codes(missingEvidence.findings)).toEqual([
      'missing-approval-evidence',
    ]);
  });

  it('retains the last approved asset on partial render failure instead of publishing nothing', () => {
    const request = baseRequest({ outputProfiles: ['still', 'poster'] });
    const first = executeMarketingMediaExportRequest({
      request,
      produceOutput: profile => okOutput({ assetHash: `hash-${profile}` }),
    });
    if (first.status !== 'executed') throw new Error('unreachable');
    const approval = approveMarketingMediaExportReceipt(first.receipt, {
      approvedReceiptDigest: first.receipt.receiptDigest,
      approvalEvidenceId: 'evidence-1',
    });
    if (!approval.ok) throw new Error('unreachable');

    // A new source revision forces a real re-render attempt (an unchanged
    // request would just be served from the reuse path above).
    const retryRequest = { ...request, sourceRevision: 'src-rev-2' };
    const retry = executeMarketingMediaExportRequest({
      request: retryRequest,
      existingReceipt: approval.receipt,
      produceOutput: profile =>
        profile === 'poster'
          ? { ok: false, code: 'output-render-failed' }
          : okOutput({ assetHash: `hash-${profile}-v2` }),
    });

    expect(retry.status).toBe('partial');
    if (retry.status !== 'partial') throw new Error('unreachable');
    expect(codes(retry.findings)).toEqual(['output-render-failed']);
    const posterOutput = retry.receipt.outputs.find(
      o => o.profile === 'poster'
    );
    expect(posterOutput?.carriedForward).toBe(true);
    expect(posterOutput?.assetHash).toBe('hash-poster');
    const stillOutput = retry.receipt.outputs.find(o => o.profile === 'still');
    expect(stillOutput?.carriedForward).toBe(false);
    expect(stillOutput?.assetHash).toBe('hash-still-v2');
  });

  it('surfaces a timeout with no prior approved asset to fall back on', () => {
    const result = executeMarketingMediaExportRequest({
      request: baseRequest({ outputProfiles: ['still'] }),
      produceOutput: () => ({ ok: false, code: 'output-timeout' }),
    });

    expect(result.status).toBe('partial');
    if (result.status !== 'partial') throw new Error('unreachable');
    expect(codes(result.findings)).toEqual(['output-timeout']);
    expect(result.receipt.outputs).toEqual([]);
  });

  it('surfaces an unavailable provider as a finding rather than a silent success', () => {
    const result = executeMarketingMediaExportRequest({
      request: baseRequest({ outputProfiles: ['still'] }),
      produceOutput: () => ({ ok: false, code: 'output-provider-unavailable' }),
    });

    expect(result.status).toBe('partial');
    if (result.status !== 'partial') throw new Error('unreachable');
    expect(codes(result.findings)).toEqual(['output-provider-unavailable']);
  });

  it('never carries forward an output from a receipt that was not actually approved', () => {
    const request = baseRequest({ outputProfiles: ['still'] });
    const unapproved = executeMarketingMediaExportRequest({
      request,
      produceOutput: () => okOutput({ assetHash: 'unapproved-hash' }),
    });
    if (unapproved.status !== 'executed') throw new Error('unreachable');
    expect(unapproved.receipt.approved).toBe(false);

    const retry = executeMarketingMediaExportRequest({
      request: { ...request, sourceRevision: 'src-rev-2' },
      existingReceipt: unapproved.receipt,
      produceOutput: () => ({ ok: false, code: 'output-render-failed' }),
    });

    expect(retry.status).toBe('partial');
    if (retry.status !== 'partial') throw new Error('unreachable');
    expect(retry.receipt.outputs).toEqual([]);
  });

  it('reuses an approved receipt across two sequential identical requests (no duplicate execution)', () => {
    const produceOutput = vi.fn(() => okOutput());
    const request = baseRequest({ outputProfiles: ['still'] });
    const first = executeMarketingMediaExportRequest({
      request,
      produceOutput,
    });
    if (first.status !== 'executed') throw new Error('unreachable');
    const approval = approveMarketingMediaExportReceipt(first.receipt, {
      approvedReceiptDigest: first.receipt.receiptDigest,
      approvalEvidenceId: 'evidence-1',
    });
    if (!approval.ok) throw new Error('unreachable');

    produceOutput.mockClear();
    const duplicate = executeMarketingMediaExportRequest({
      request,
      existingReceipt: approval.receipt,
      produceOutput,
    });
    const duplicateAgain = executeMarketingMediaExportRequest({
      request,
      existingReceipt: approval.receipt,
      produceOutput,
    });

    expect(duplicate.status).toBe('reused');
    expect(duplicateAgain.status).toBe('reused');
    expect(produceOutput).not.toHaveBeenCalled();
  });

  it('succeeds on a valid static-only request even when the video renderer is unavailable', () => {
    const produceOutput = vi.fn((profile: string) => {
      if (profile === 'sequence') {
        throw new Error(
          'video renderer must never be invoked for a static-only request'
        );
      }
      return okOutput();
    });

    const result = executeMarketingMediaExportRequest({
      request: baseRequest({
        outputProfiles: ['still', 'poster'],
        fallbackPolicy: 'static-only',
      }),
      produceOutput,
    });

    expect(result.status).toBe('executed');
    expect(produceOutput).toHaveBeenCalledTimes(2);
    expect(produceOutput).toHaveBeenCalledWith('still');
    expect(produceOutput).toHaveBeenCalledWith('poster');
  });

  it('embeds canonical accent, flow-direction and safe-area rules and prohibits fabricated UI', () => {
    const staticPrompt = formatMarketingMediaExportRequestForPrompt(
      baseRequest({ outputProfiles: ['still'] })
    );
    expect(staticPrompt).toContain(homepageFixture.accentToken);
    expect(staticPrompt).toContain('safe area');
    expect(staticPrompt).toContain('Do not fabricate Jovie UI');
    expect(staticPrompt).toContain('does not approve its own artifact');

    const flowingPrompt = formatMarketingMediaExportRequestForPrompt(
      baseRequest({
        recipeId: 'flowing-accent',
        accentToken: '--system-b-accent-cyan',
        outputProfiles: ['still'],
      })
    );
    expect(flowingPrompt).toContain('Flow direction');
    expect(flowingPrompt).toContain('Never: invent a third recipe');
  });
});
