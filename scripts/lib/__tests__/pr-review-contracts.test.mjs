import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembleReceipt,
  MAX_PUBLISHED_INLINE_FINDINGS,
  MAX_SPECIALISTS,
  PR_REVIEW_RECEIPT_SCHEMA,
  planReview,
  RISK_REVIEW_FLOORS,
  rootCauseId,
  selectPublishableFindings,
  summarizeReceipt,
  validateFinding,
} from '../pr-review-contracts.mjs';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const NEWER = 'c'.repeat(40);

function finding(overrides = {}) {
  return {
    state: 'verified',
    severity: 'P1',
    evidenceLevel: 'cross-file-argument',
    rootCauseId: rootCauseId({
      ruleId: 'billing-money',
      symbol: 'handleWebhook',
      consequenceClass: 'duplicate-fulfillment',
    }),
    introducedByPr: true,
    location: { path: 'apps/web/app/api/stripe/webhook/route.ts', line: 42 },
    title: 'Duplicate fulfillment on webhook retry',
    trigger: 'Crash between side effect and processed-event insert',
    consequence: 'Retry fulfills the same event twice',
    repair: 'Claim the event id before the side effect',
    evidence: ['route.ts:42 side effect precedes insert at :57'],
    ...overrides,
  };
}

describe('planReview', () => {
  it('always includes the behavior specialist and defaults to the cheap tier', () => {
    expect(planReview()).toMatchObject({
      specialists: ['behavior-contracts'],
      minTier: 'cheap',
      tier: 'cheap',
      forcedBy: [],
    });
  });

  it('forces the strong tier for money and identity and never lets advice downgrade it', () => {
    const plan = planReview({
      riskRuleIds: ['billing-money', 'auth-identity'],
      advisedTier: 'cheap',
    });
    expect(plan.tier).toBe('strong');
    expect(plan.forcedBy).toEqual(['auth-identity', 'billing-money']);
    expect(plan.specialists).toEqual([
      'behavior-contracts',
      'identity-ownership',
      'billing-money',
    ]);
  });

  it('lets advice raise a low-risk PR to the strong tier', () => {
    expect(planReview({ advisedTier: 'strong' }).tier).toBe('strong');
  });

  it('caps specialists and reports what it dropped', () => {
    const plan = planReview({
      riskRuleIds: Object.keys(RISK_REVIEW_FLOORS),
      testsChanged: true,
    });
    expect(plan.specialists).toHaveLength(MAX_SPECIALISTS);
    expect(plan.droppedSpecialists.length).toBeGreaterThan(0);
  });

  it('ignores unknown rule ids', () => {
    expect(planReview({ riskRuleIds: ['public-ui'] }).specialists).toEqual([
      'behavior-contracts',
    ]);
  });

  it('only maps rule ids that exist in the ci-harness manifest', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '..',
          '..',
          '..',
          '.github/ci-harness/manifest.json'
        ),
        'utf8'
      )
    );
    const known = new Set(manifest.riskRules.map(rule => rule.id));
    for (const ruleId of Object.keys(RISK_REVIEW_FLOORS)) {
      expect(known.has(ruleId), ruleId).toBe(true);
    }
  });
});

describe('rootCauseId', () => {
  it('is stable across heads and distinct across consequences', () => {
    const a = rootCauseId({
      ruleId: 'x',
      symbol: 'f',
      consequenceClass: 'leak',
    });
    expect(a).toBe(
      rootCauseId({ ruleId: 'x', symbol: 'f', consequenceClass: 'leak' })
    );
    expect(a).not.toBe(
      rootCauseId({ ruleId: 'x', symbol: 'f', consequenceClass: 'dup' })
    );
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('validateFinding', () => {
  it('accepts a complete finding', () => {
    expect(validateFinding(finding())).toEqual([]);
  });

  it('rejects vague findings with no consequence or evidence', () => {
    expect(
      validateFinding(
        finding({ consequence: ' ', evidence: [], state: 'addressed' })
      )
    ).toEqual(['state', 'consequence', 'evidence']);
  });

  it('rejects non-objects and bad locations', () => {
    expect(validateFinding(null)).toEqual(['finding must be an object']);
    expect(
      validateFinding(finding({ location: { path: 'a.ts', line: 0 } }))
    ).toEqual(['location']);
  });
});

describe('assembleReceipt', () => {
  it('builds a non-blocking, never-certified receipt', () => {
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      findings: [finding()],
    });
    expect(receipt).toMatchObject({
      schema: PR_REVIEW_RECEIPT_SCHEMA,
      status: 'complete',
      shipBlocking: false,
      certified: false,
    });
  });

  it('marks budget exhaustion or provider failure incomplete', () => {
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      failure: 'budget-exhausted',
    });
    expect(receipt.status).toBe('incomplete');
    expect(summarizeReceipt(receipt)).toBe('incomplete');
  });

  it('marks every finding stale when the head moved during review', () => {
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      liveHeadSha: NEWER,
      findings: [finding()],
    });
    expect(receipt.status).toBe('stale');
    expect(receipt.findings.map(f => f.state)).toEqual(['stale']);
  });

  it('refuses invalid shas and invalid findings', () => {
    expect(() =>
      assembleReceipt({ pr: 1, baseSha: 'main', headSha: HEAD })
    ).toThrow(/headSha must be/);
    expect(() =>
      assembleReceipt({ pr: 0, baseSha: BASE, headSha: HEAD })
    ).toThrow(/pr/);
    expect(() =>
      assembleReceipt({ pr: 1, baseSha: BASE, headSha: HEAD, findings: [{}] })
    ).toThrow(/invalid findings/);
  });
});

describe('summarizeReceipt', () => {
  it('never reports clean when an area was not assessed', () => {
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      coverage: {
        assessed: ['behavior-contracts'],
        notAssessed: ['billing-money'],
      },
    });
    expect(summarizeReceipt(receipt)).toBe('partially-assessed');
  });

  it('reports verified findings and fully assessed clean results', () => {
    const base = { pr: 1, baseSha: BASE, headSha: HEAD };
    expect(
      summarizeReceipt(assembleReceipt({ ...base, findings: [finding()] }))
    ).toBe('verified-findings');
    expect(
      summarizeReceipt(
        assembleReceipt({
          ...base,
          findings: [finding({ state: 'candidate' })],
        })
      )
    ).toBe('no-verified-findings');
    expect(
      summarizeReceipt(assembleReceipt({ ...base, liveHeadSha: NEWER }))
    ).toBe('stale');
  });
});

describe('selectPublishableFindings', () => {
  it('publishes nothing for a head other than the reviewed one', () => {
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      findings: [finding()],
    });
    expect(selectPublishableFindings(receipt, NEWER)).toEqual([]);
  });

  it('publishes nothing from a stale receipt', () => {
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      liveHeadSha: NEWER,
      findings: [finding()],
    });
    expect(selectPublishableFindings(receipt, HEAD)).toEqual([]);
  });

  it('keeps verified P0/P1 only, dedupes by root cause, orders by severity, caps', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      finding({
        severity: i === 7 ? 'P0' : 'P1',
        rootCauseId: rootCauseId({
          ruleId: 'r',
          symbol: `s${i}`,
          consequenceClass: 'c',
        }),
      })
    );
    const receipt = assembleReceipt({
      pr: 1,
      baseSha: BASE,
      headSha: HEAD,
      findings: [
        finding({ severity: 'P2' }),
        finding({ state: 'candidate' }),
        finding(),
        finding(),
        ...many,
      ],
    });
    const published = selectPublishableFindings(receipt, HEAD);
    expect(published).toHaveLength(MAX_PUBLISHED_INLINE_FINDINGS);
    expect(published[0].severity).toBe('P0');
    expect(new Set(published.map(f => f.rootCauseId)).size).toBe(
      published.length
    );
    expect(
      published.every(f => f.state === 'verified' && f.severity !== 'P2')
    ).toBe(true);
  });
});
