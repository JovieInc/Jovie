import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MerchCandidateQaReview,
  MerchDesignOption,
} from '@/lib/db/schema/merch';
import {
  assertMerchCandidateSelectable,
  assertMerchQaPublishableForCard,
  computeMerchQaInputHash,
  computeMerchQaReferenceHash,
  createMerchRemediationCandidate,
  getMerchQaPublishBlockers,
  isMerchQaReceiptFresh,
  listMerchQaQuarantine,
  MERCH_QA_BORDERLINE_BLOCKER,
  MERCH_QA_FAIL_BLOCKER,
  MERCH_QA_MISSING_RECEIPT_BLOCKER,
  MERCH_QA_REVIEW_UNAVAILABLE_BLOCKER,
  type MerchVisualReviewer,
  runMerchCandidateQa,
} from './qa-gate';

const OPTION_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OPTION_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const BATCH_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const PROFILE_ID = 'cccccccc-0000-4000-8000-000000000001';
const RECEIPT_ID = 'dddddddd-0000-4000-8000-000000000001';

// Drizzle chain mock: every db.select() consumes the next queued row set,
// regardless of whether the query ends in .where(), .orderBy(), or .limit().
const qaDb = vi.hoisted(() => {
  type Rows = unknown[];
  const state = {
    selectResults: [] as Rows[],
    insertReturnings: [] as Rows[],
    selectCalls: 0,
    setCalls: [] as unknown[],
    valuesCalls: [] as unknown[],
  };

  const terminal = (rows: Rows): unknown => {
    const node: Record<string, unknown> = {
      then: (onFulfilled?: (value: Rows) => unknown) =>
        Promise.resolve(rows).then(onFulfilled),
      limit: () => Promise.resolve(rows),
    };
    node.orderBy = () => node;
    return node;
  };

  const dbMock = {
    select: () => {
      state.selectCalls += 1;
      return {
        from: () => ({
          where: () => terminal(state.selectResults.shift() ?? []),
        }),
      };
    },
    update: () => ({
      set: (value: unknown) => {
        state.setCalls.push(value);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
    insert: () => ({
      values: (value: unknown) => {
        state.valuesCalls.push(value);
        return {
          returning: () =>
            Promise.resolve(state.insertReturnings.shift() ?? []),
        };
      },
    }),
  };

  return { state, dbMock };
});

vi.mock('@/lib/db', () => ({ db: qaDb.dbMock }));

const mockGetAppFlagValue = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mockGetAppFlagValue,
}));

const PASS_REVIEWER: MerchVisualReviewer = {
  version: 'test-pass/v1',
  review: () =>
    Promise.resolve({ verdict: 'pass', reasonCodes: [], confidence: 0.95 }),
};

const FAIL_REVIEWER: MerchVisualReviewer = {
  version: 'test-fail/v1',
  review: () =>
    Promise.resolve({
      verdict: 'fail',
      reasonCodes: ['visual.mismatch'],
      confidence: 0.9,
      severity: 'blocker',
      remediationInstruction: 'Regenerate with a centered graphic.',
    }),
};

const THROWING_REVIEWER: MerchVisualReviewer = {
  version: 'test-down/v1',
  review: () => Promise.reject(new Error('reviewer unavailable')),
};

const CONTENT_PASS_REVIEW = {
  contractVersion: 'merch-content/v1',
  reviewerVersion: 'merch-person-reviewer/v1',
  mode: 'graphic_only',
  verdict: 'pass',
  failureCodes: [],
  confidence: 1,
  reviewedAt: '2026-01-01T00:00:00.000Z',
} as const;

const STAMPED_QUALITY_REVIEW: Record<string, unknown> = {
  contractVersion: 'merch-generation/v1',
  contentContractVersion: 'merch-content/v1',
  contentReviewerVersion: 'merch-person-reviewer/v1',
  contentReview: { ...CONTENT_PASS_REVIEW },
  mockupStatus: 'mockup_ready',
};

function makeOption(
  overrides: Partial<MerchDesignOption> = {}
): MerchDesignOption {
  return {
    id: OPTION_ID,
    generationBatchId: BATCH_ID,
    creatorProfileId: PROFILE_ID,
    optionNumber: 1,
    status: 'candidate',
    designLane: 'band_tour_uniform',
    designName: 'Static Skull Tee',
    productType: 'tshirt',
    printfulProductName: 'Premium Tee',
    printfulCatalogProductId: 71,
    printfulCatalogVariantIds: [4011, 4012],
    variantMap: { '4011': 1 },
    colorway: 'black',
    availableSizes: ['S', 'M', 'L'],
    placements: ['front'],
    technique: 'dtg',
    retailPriceCents: 4100,
    estimatedPrintfulProductCostCents: 1750,
    estimatedShippingCostCents: 525,
    estimatedGrossMarginCents: 1500,
    artistShareCents: 993,
    jovieShareCents: 993,
    pricing: {
      currency: 'USD',
      retailPriceCents: 4100,
      estimatedPrintfulProductCostCents: 1750,
      estimatedShippingCostCents: 525,
      stripeFeeEstimateCents: 164,
      refundReserveCents: 200,
      artistRoyaltyRateBps: 5000,
      artistPayoutPerUnitEstimateCents: 993,
      jovieMarginPerUnitEstimateCents: 993,
    },
    concept: 'glitch skull over static',
    whyItFits: 'matches the release artwork',
    mockupUrls: ['https://cdn.example.com/mockup-1.png'],
    printFileUrls: ['https://cdn.example.com/print-1.png'],
    productionWarnings: [],
    qualityReview: { ...STAMPED_QUALITY_REVIEW },
    learning: {
      styleLane: 'dark',
      typographyStyle: 'condensed',
      graphicDensity: 'medium',
      garmentColor: 'black',
      motifs: ['skull'],
      selectedOverOptionIds: [],
      rejectedAttributes: [],
    },
    remediationOfOptionId: null,
    remediationInstruction: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeReceipt(
  overrides: Partial<MerchCandidateQaReview> = {}
): MerchCandidateQaReview {
  return {
    id: RECEIPT_ID,
    designOptionId: OPTION_ID,
    merchCardId: null,
    creatorProfileId: PROFILE_ID,
    verdict: 'pass',
    severity: 'info',
    reasonCodes: [],
    reviewerVersion: PASS_REVIEWER.version,
    confidence: 1,
    inputHash: 'stale-input-hash',
    referenceHash: 'stale-reference-hash',
    retryCount: 0,
    remediationInstruction: null,
    disposition: 'cleared',
    details: {},
    reviewedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

/** Receipt whose hashes match the option's current payload + reviewer version. */
function makeFreshReceipt(
  option: MerchDesignOption,
  reviewerVersion: string,
  overrides: Partial<MerchCandidateQaReview> = {}
): MerchCandidateQaReview {
  return makeReceipt({
    inputHash: computeMerchQaInputHash(option),
    referenceHash: computeMerchQaReferenceHash(option, reviewerVersion),
    reviewerVersion,
    ...overrides,
  });
}

const GATE_ON = { gateEnabled: true } as const;

beforeEach(() => {
  qaDb.state.selectResults.length = 0;
  qaDb.state.insertReturnings.length = 0;
  qaDb.state.setCalls.length = 0;
  qaDb.state.valuesCalls.length = 0;
  qaDb.state.selectCalls = 0;
  mockGetAppFlagValue.mockClear().mockResolvedValue(true);
});

describe('getMerchQaPublishBlockers', () => {
  it('does not touch the database when the gate flag is off', async () => {
    const blockers = await getMerchQaPublishBlockers(makeOption(), {
      gateEnabled: false,
    });
    expect(blockers).toEqual([]);
    expect(qaDb.state.selectCalls).toBe(0);
  });

  it('reads the app flag when no override is provided', async () => {
    mockGetAppFlagValue.mockResolvedValueOnce(false);
    const blockers = await getMerchQaPublishBlockers(makeOption());
    expect(mockGetAppFlagValue).toHaveBeenCalledWith(
      'MERCH_QA_GATE',
      expect.objectContaining({ userId: null })
    );
    expect(blockers).toEqual([]);
  });

  it('skips legacy unstamped options', async () => {
    const legacy = makeOption({ qualityReview: {} });
    const blockers = await getMerchQaPublishBlockers(legacy, {
      ...GATE_ON,
      reviewer: THROWING_REVIEWER,
    });
    expect(blockers).toEqual([]);
    expect(qaDb.state.selectCalls).toBe(0);
  });

  it('fails closed on missing evidence when the review cannot run', async () => {
    qaDb.state.selectResults.push([]); // no prior receipts
    const blockers = await getMerchQaPublishBlockers(makeOption(), {
      ...GATE_ON,
      reviewer: THROWING_REVIEWER,
    });
    expect(blockers).toEqual([MERCH_QA_MISSING_RECEIPT_BLOCKER]);
  });

  it('reviews a candidate with no receipt and persists the receipt', async () => {
    qaDb.state.selectResults.push([], []); // latest lookup, prior-receipt count
    qaDb.state.insertReturnings.push([
      makeReceipt({ verdict: 'pass', disposition: 'cleared' }),
    ]);
    const blockers = await getMerchQaPublishBlockers(makeOption(), {
      ...GATE_ON,
      reviewer: PASS_REVIEWER,
    });
    expect(blockers).toEqual([]);
    expect(qaDb.state.valuesCalls).toHaveLength(1);
  });

  it('rejects stale evidence instead of trusting it (fail-closed)', async () => {
    // A PASS receipt whose hashes no longer match the candidate payload must
    // not be honored — with the reviewer down there is no valid evidence.
    qaDb.state.selectResults.push([makeReceipt({ verdict: 'pass' })]);
    const blockers = await getMerchQaPublishBlockers(makeOption(), {
      ...GATE_ON,
      reviewer: THROWING_REVIEWER,
    });
    expect(blockers).toEqual([MERCH_QA_REVIEW_UNAVAILABLE_BLOCKER]);
    expect(qaDb.state.valuesCalls).toHaveLength(0);
  });

  it('re-runs review on stale evidence and trusts only the new receipt', async () => {
    qaDb.state.selectResults.push(
      [makeReceipt({ verdict: 'pass' })], // stale latest
      [{ id: RECEIPT_ID }] // prior receipt count
    );
    qaDb.state.insertReturnings.push([
      makeReceipt({
        verdict: 'fail',
        disposition: 'quarantined',
        reasonCodes: ['visual.mismatch'],
      }),
    ]);
    const blockers = await getMerchQaPublishBlockers(makeOption(), {
      ...GATE_ON,
      reviewer: FAIL_REVIEWER,
    });
    expect(blockers[0]).toBe(MERCH_QA_FAIL_BLOCKER);
    expect(blockers).toContain('QA reason: visual.mismatch');
  });

  it('blocks publish on a fresh FAIL receipt without re-reviewing', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push([
      makeFreshReceipt(option, PASS_REVIEWER.version, {
        verdict: 'fail',
        disposition: 'quarantined',
        reasonCodes: ['mockup.failed'],
      }),
    ]);
    const blockers = await getMerchQaPublishBlockers(option, {
      ...GATE_ON,
      reviewer: PASS_REVIEWER,
    });
    expect(blockers[0]).toBe(MERCH_QA_FAIL_BLOCKER);
    expect(qaDb.state.valuesCalls).toHaveLength(0);
  });

  it('blocks publish on a fresh BORDERLINE receipt (human review required)', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push([
      makeFreshReceipt(option, PASS_REVIEWER.version, {
        verdict: 'borderline',
        disposition: 'escalated',
      }),
    ]);
    const blockers = await getMerchQaPublishBlockers(option, {
      ...GATE_ON,
      reviewer: PASS_REVIEWER,
    });
    expect(blockers).toEqual([MERCH_QA_BORDERLINE_BLOCKER]);
  });

  it('returns no blockers on a fresh PASS receipt', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push([
      makeFreshReceipt(option, PASS_REVIEWER.version),
    ]);
    const blockers = await getMerchQaPublishBlockers(option, {
      ...GATE_ON,
      reviewer: PASS_REVIEWER,
    });
    expect(blockers).toEqual([]);
  });
});

describe('assertMerchCandidateSelectable', () => {
  it('rejects a candidate whose latest receipt is FAIL (bypass attempt)', async () => {
    const option = makeOption({ status: 'quarantined' });
    qaDb.state.selectResults.push([
      makeFreshReceipt(option, PASS_REVIEWER.version, {
        verdict: 'fail',
        disposition: 'quarantined',
      }),
    ]);
    await expect(
      assertMerchCandidateSelectable(option, {
        ...GATE_ON,
        reviewer: PASS_REVIEWER,
      })
    ).rejects.toThrow(MERCH_QA_FAIL_BLOCKER);
  });

  it('allows a candidate with a fresh PASS receipt', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push([
      makeFreshReceipt(option, PASS_REVIEWER.version),
    ]);
    await expect(
      assertMerchCandidateSelectable(option, {
        ...GATE_ON,
        reviewer: PASS_REVIEWER,
      })
    ).resolves.toBeUndefined();
  });

  it('allows borderline candidates to be selected into drafts', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push([
      makeFreshReceipt(option, PASS_REVIEWER.version, {
        verdict: 'borderline',
        disposition: 'escalated',
      }),
    ]);
    await expect(
      assertMerchCandidateSelectable(option, {
        ...GATE_ON,
        reviewer: PASS_REVIEWER,
      })
    ).resolves.toBeUndefined();
  });

  it('allows legacy unstamped options without touching the database', async () => {
    await expect(
      assertMerchCandidateSelectable(makeOption({ qualityReview: {} }), {
        ...GATE_ON,
        reviewer: THROWING_REVIEWER,
      })
    ).resolves.toBeUndefined();
    expect(qaDb.state.selectCalls).toBe(0);
  });
});

describe('assertMerchQaPublishableForCard', () => {
  it('grandfathers cards that were already published', async () => {
    await expect(
      assertMerchQaPublishableForCard(
        { selectedDesignOptionId: OPTION_ID, publishedAt: new Date() },
        { ...GATE_ON, reviewer: THROWING_REVIEWER }
      )
    ).resolves.toBeUndefined();
    expect(qaDb.state.selectCalls).toBe(0);
  });

  it('skips cards with no linked design option', async () => {
    await expect(
      assertMerchQaPublishableForCard(
        { selectedDesignOptionId: null, publishedAt: null },
        { ...GATE_ON, reviewer: THROWING_REVIEWER }
      )
    ).resolves.toBeUndefined();
    expect(qaDb.state.selectCalls).toBe(0);
  });

  it('rejects a direct publish call against a FAIL receipt', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push(
      [option],
      [
        makeFreshReceipt(option, PASS_REVIEWER.version, {
          verdict: 'fail',
          disposition: 'quarantined',
        }),
      ]
    );
    await expect(
      assertMerchQaPublishableForCard(
        { selectedDesignOptionId: OPTION_ID, publishedAt: null },
        { ...GATE_ON, reviewer: PASS_REVIEWER }
      )
    ).rejects.toThrow('Merch card cannot be published');
  });

  it('rejects a direct publish call when the review cannot produce evidence', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push([option], []); // option load, no receipts
    await expect(
      assertMerchQaPublishableForCard(
        { selectedDesignOptionId: OPTION_ID, publishedAt: null },
        { ...GATE_ON, reviewer: THROWING_REVIEWER }
      )
    ).rejects.toThrow('Merch card cannot be published');
  });

  it('allows publish with a fresh PASS receipt', async () => {
    const option = makeOption();
    qaDb.state.selectResults.push(
      [option],
      [makeFreshReceipt(option, PASS_REVIEWER.version)]
    );
    await expect(
      assertMerchQaPublishableForCard(
        { selectedDesignOptionId: OPTION_ID, publishedAt: null },
        { ...GATE_ON, reviewer: PASS_REVIEWER }
      )
    ).resolves.toBeUndefined();
  });
});

describe('runMerchCandidateQa', () => {
  it('fails a candidate with a failed mockup and quarantines it', async () => {
    const option = makeOption({
      qualityReview: {
        ...STAMPED_QUALITY_REVIEW,
        mockupStatus: 'mockup_failed',
      },
    });
    qaDb.state.selectResults.push([]); // no prior receipts
    qaDb.state.insertReturnings.push([makeReceipt({ verdict: 'fail' })]);

    await runMerchCandidateQa(option, { reviewer: PASS_REVIEWER });

    const inserted = qaDb.state.valuesCalls[0] as Record<string, unknown>;
    expect(inserted.verdict).toBe('fail');
    expect(inserted.disposition).toBe('quarantined');
    expect(inserted.reasonCodes).toEqual(
      expect.arrayContaining(['mockup.failed'])
    );
    expect(qaDb.state.setCalls).toContainEqual(
      expect.objectContaining({ status: 'quarantined' })
    );
  });

  it('marks pending-mockup candidates borderline and escalated', async () => {
    const option = makeOption({
      qualityReview: {
        ...STAMPED_QUALITY_REVIEW,
        mockupStatus: 'pending_mockup',
      },
    });
    qaDb.state.selectResults.push([]);
    qaDb.state.insertReturnings.push([makeReceipt({ verdict: 'borderline' })]);

    await runMerchCandidateQa(option, { reviewer: PASS_REVIEWER });

    const inserted = qaDb.state.valuesCalls[0] as Record<string, unknown>;
    expect(inserted.verdict).toBe('borderline');
    expect(inserted.disposition).toBe('escalated');
    expect(inserted.reasonCodes).toEqual(
      expect.arrayContaining(['mockup.pending'])
    );
  });

  it('fails candidates rejected by the deterministic content review', async () => {
    const option = makeOption({
      qualityReview: {
        ...STAMPED_QUALITY_REVIEW,
        contentReview: {
          ...CONTENT_PASS_REVIEW,
          verdict: 'reject',
          failureCodes: ['person.face'],
        },
      },
    });
    qaDb.state.selectResults.push([]);
    qaDb.state.insertReturnings.push([makeReceipt({ verdict: 'fail' })]);

    await runMerchCandidateQa(option, { reviewer: PASS_REVIEWER });

    const inserted = qaDb.state.valuesCalls[0] as Record<string, unknown>;
    expect(inserted.verdict).toBe('fail');
    expect(inserted.disposition).toBe('quarantined');
    expect(inserted.reasonCodes).toEqual(
      expect.arrayContaining(['content.review_blocked', 'person.face'])
    );
  });

  it('takes the worst verdict across deterministic checks and the reviewer', async () => {
    const option = makeOption({
      qualityReview: {
        ...STAMPED_QUALITY_REVIEW,
        mockupStatus: 'pending_mockup',
      },
    });
    qaDb.state.selectResults.push([]);
    qaDb.state.insertReturnings.push([makeReceipt({ verdict: 'fail' })]);

    await runMerchCandidateQa(option, { reviewer: FAIL_REVIEWER });

    const inserted = qaDb.state.valuesCalls[0] as Record<string, unknown>;
    expect(inserted.verdict).toBe('fail');
    expect(inserted.reasonCodes).toEqual(
      expect.arrayContaining(['mockup.pending', 'visual.mismatch'])
    );
    expect(inserted.remediationInstruction).toBe(
      'Regenerate with a centered graphic.'
    );
  });

  it('supersedes prior receipts and increments the retry count', async () => {
    qaDb.state.selectResults.push([{ id: 'old-receipt' }]);
    qaDb.state.insertReturnings.push([makeReceipt({ retryCount: 1 })]);

    await runMerchCandidateQa(makeOption(), { reviewer: PASS_REVIEWER });

    expect(qaDb.state.setCalls).toContainEqual({
      disposition: 'superseded',
    });
    const inserted = qaDb.state.valuesCalls[0] as Record<string, unknown>;
    expect(inserted.retryCount).toBe(1);
    expect(inserted.disposition).toBe('cleared');
  });

  it('releases a quarantined candidate back to candidate on pass', async () => {
    const option = makeOption({ status: 'quarantined' });
    qaDb.state.selectResults.push([]);
    qaDb.state.insertReturnings.push([makeReceipt()]);

    await runMerchCandidateQa(option, { reviewer: PASS_REVIEWER });

    expect(qaDb.state.setCalls).toContainEqual(
      expect.objectContaining({ status: 'candidate' })
    );
  });
});

describe('listMerchQaQuarantine', () => {
  it('returns quarantined and escalated candidates with review routing', async () => {
    const receiptFail = makeReceipt({
      id: 'r1',
      disposition: 'quarantined',
      verdict: 'fail',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    const receiptBorderline = makeReceipt({
      id: 'r2',
      designOptionId: OPTION_ID_2,
      disposition: 'escalated',
      verdict: 'borderline',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const supersededSameOption = makeReceipt({
      id: 'r0',
      disposition: 'quarantined',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    qaDb.state.selectResults.push(
      [receiptFail, receiptBorderline, supersededSameOption],
      [makeOption(), makeOption({ id: OPTION_ID_2 })]
    );

    const queue = await listMerchQaQuarantine(PROFILE_ID);

    expect(queue).toHaveLength(2);
    expect(queue[0].option.id).toBe(OPTION_ID);
    expect(queue[0].receipt.id).toBe('r1');
    expect(queue[0].needsHumanReview).toBe(false);
    expect(queue[1].option.id).toBe(OPTION_ID_2);
    expect(queue[1].needsHumanReview).toBe(true);
  });

  it('returns an empty queue when nothing is quarantined', async () => {
    qaDb.state.selectResults.push([]);
    await expect(listMerchQaQuarantine(PROFILE_ID)).resolves.toEqual([]);
    expect(qaDb.state.selectCalls).toBe(1);
  });
});

describe('createMerchRemediationCandidate', () => {
  it('clones the option into a fresh candidate carrying the instruction', async () => {
    const source = makeOption({ status: 'quarantined' });
    const created = makeOption({
      id: 'eeeeeeee-0000-4000-8000-000000000001',
      optionNumber: 3,
      remediationOfOptionId: OPTION_ID,
      remediationInstruction: 'Center the graphic and brighten the print.',
    });
    qaDb.state.selectResults.push([{ optionNumber: 1 }, { optionNumber: 2 }]);
    qaDb.state.insertReturnings.push([created]);

    const candidate = await createMerchRemediationCandidate({
      option: source,
      instruction: 'Center the graphic and brighten the print.',
      createdByClerkUserId: 'clerk_123',
    });

    expect(candidate).toBe(created);
    const inserted = qaDb.state.valuesCalls[0] as Record<string, unknown>;
    expect(inserted.optionNumber).toBe(3);
    expect(inserted.status).toBe('candidate');
    expect(inserted.remediationOfOptionId).toBe(OPTION_ID);
    expect(inserted.remediationInstruction).toBe(
      'Center the graphic and brighten the print.'
    );
    expect(inserted.productionWarnings).toEqual([]);
    expect(inserted.qualityReview).toEqual(source.qualityReview);
  });
});

describe('isMerchQaReceiptFresh', () => {
  it('is fresh only when both hashes match', () => {
    const option = makeOption();
    const receipt = makeFreshReceipt(option, PASS_REVIEWER.version);
    expect(isMerchQaReceiptFresh(receipt, option, PASS_REVIEWER.version)).toBe(
      true
    );

    const edited = makeOption({ designName: 'Edited Tee' });
    expect(isMerchQaReceiptFresh(receipt, edited, PASS_REVIEWER.version)).toBe(
      false
    );

    expect(isMerchQaReceiptFresh(receipt, option, 'other-reviewer/v9')).toBe(
      false
    );
  });
});
