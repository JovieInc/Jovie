import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { MARKETING_PRICING_PLANS } from '@/data/marketingPricingPlans';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { collectStrings, isClaimBearing, resolvesToClaim } from './claim-audit';
import { listProductTruthClaims } from './claims';
import type { DogfoodReceiptsFile } from './dogfood';
import dogfoodReceipts from './dogfood-receipts.gen.json';
import {
  auditGoldenPathClaims,
  GOLDEN_PATH_CLAIMS,
  type GoldenPathClaim,
  type GoldenPathProofReport,
  HARD_FAIL_STATUSES,
  WANTED_CLAIMS,
} from './golden-path-claims';
import type { ProofCandidate } from './proof';

/**
 * Golden-path proof gate (JOV-7750). Hard failures: invented numbers,
 * offers that do not quote offer-truth, checkable "positioning". Proof gaps
 * and uncertified capabilities live in `golden-path-proof-baseline.json`,
 * which may only shrink. `UPDATE_GOLDEN_PATH_PROOF=1` rewrites the report
 * the funnel judge reads and drops resolved baseline entries; it never adds.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REPORT_PATH = path.join(__dirname, 'golden-path-proof.gen.json');
const BASELINE_PATH = path.join(__dirname, 'golden-path-proof-baseline.json');
const UPDATE = process.env.UPDATE_GOLDEN_PATH_PROOF === '1';

interface Baseline {
  readonly description: string;
  readonly open: Readonly<Record<string, string>>;
}

function certifiedIds(): Set<string> {
  const file = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, 'scripts/lanes/certified-capabilities.gen.json'),
      'utf8'
    )
  ) as { ids: string[] };
  return new Set(file.ids);
}

const offerClaims = listProductTruthClaims().filter(
  claim => claim.kind === 'offer' || claim.source === 'offer-truth'
);

function liveReport(): GoldenPathProofReport {
  return auditGoldenPathClaims({
    asOf: (dogfoodReceipts as DogfoodReceiptsFile).measuredAt,
    certifiedCapabilityIds: certifiedIds(),
    offerClaims,
  });
}

/**
 * A number a reader would take as a fact. Letterless values ("$199") are
 * offer-truth price chips; "01 / Identity" is an ordinal label.
 */
function isNumericCopy(text: string): boolean {
  return /\p{L}/u.test(text) && /\d/u.test(text) && !/^\d+\s\/\s/u.test(text);
}

const AS_OF = '2026-10-04T00:00:00.000Z';

function audit(
  claims: readonly GoldenPathClaim[],
  registry: readonly ProofCandidate[] = [],
  asOf = AS_OF
) {
  return auditGoldenPathClaims({
    asOf,
    certifiedCapabilityIds: new Set(['public-profile']),
    offerClaims: [
      {
        id: 'offer.free.note',
        capabilityId: 'public-profile',
        statement: 'Free forever.',
        kind: 'offer',
        source: 'offer-truth',
      },
    ],
    registry,
    claims,
  });
}

const base = {
  step: 'homepage',
  route: '/',
  source: 'fixture.ts',
  capabilityIds: ['public-profile'],
} as const;

const dogfoodMetric = (measuredAt: string): ProofCandidate => ({
  recordType: 'proof',
  id: 'dogfood-fixture',
  kind: 'metric',
  claimId: 'dogfood.fixture',
  evidence: 'dogfood',
  value: 12,
  unit: 'clicks',
  reproducingQuery: 'select 12',
  measuredAt,
  sample: { size: 12, population: 'fixture' },
  source: 'fixture',
});

describe('golden-path proof audit', () => {
  it('fails a number in an outcome claim without evidence', () => {
    const report = audit([
      {
        ...base,
        id: 'fake-stat',
        copy: 'Artists see 3x more fans',
        nature: 'outcome',
        evidence: {
          class: 'none',
          kind: 'metric',
          generator: 'dogfood',
          need: 'fixture',
        },
      },
    ]);
    expect(report.claims[0]?.status).toBe('invented-number');
    expect(report.claims[0]?.request?.generator).toBe('dogfood');
  });

  it('fails a number in capability or positioning copy', () => {
    const report = audit([
      { ...base, id: 'cap', copy: 'Reach 10,000 fans', nature: 'capability' },
      { ...base, id: 'pos', copy: 'Built for 2027', nature: 'positioning' },
    ]);
    expect(report.claims.map(claim => claim.status)).toEqual([
      'invented-number',
      'invented-number',
    ]);
  });

  it('admits fresh dogfood proof and turns stale or misclassified proof into a gap', () => {
    const claim: GoldenPathClaim = {
      ...base,
      id: 'found',
      copy: 'Be found.',
      nature: 'outcome',
      evidence: { class: 'dogfood', proofIds: ['dogfood-fixture'] },
    };
    expect(
      audit([claim], [dogfoodMetric('2026-10-01T00:00:00.000Z')]).claims[0]
        ?.status
    ).toBe('admissible');
    const stale = audit([claim], [dogfoodMetric('2026-08-01T00:00:00.000Z')])
      .claims[0];
    expect(stale?.status).toBe('proof-gap');
    expect(stale?.request?.generator).toBe('dogfood');
    const asPilot = audit(
      [
        {
          ...claim,
          evidence: { class: 'pilot', proofIds: ['dogfood-fixture'] },
        },
      ],
      [dogfoodMetric('2026-10-01T00:00:00.000Z')]
    ).claims[0];
    expect(asPilot?.status).toBe('proof-gap');
    expect(asPilot?.request?.generator).toBe('pilot');
  });

  it('fails a rendered number backed only by weak dogfood proof', () => {
    const weak = {
      ...dogfoodMetric('2026-10-01T00:00:00.000Z'),
      strength: 'weak',
    } as ProofCandidate;
    const report = audit(
      [
        {
          ...base,
          id: 'weak-number',
          copy: '61 clicks on our own profile',
          nature: 'outcome',
          evidence: { class: 'dogfood', proofIds: ['dogfood-fixture'] },
        },
        {
          ...base,
          id: 'weak-backing',
          copy: 'Be found.',
          nature: 'outcome',
          evidence: { class: 'dogfood', proofIds: ['dogfood-fixture'] },
        },
      ],
      [weak]
    );
    expect(report.claims.map(claim => claim.status)).toEqual([
      'weak-proof-rendered',
      'admissible',
    ]);
  });

  it('admits computed slots and flags uncertified capabilities', () => {
    const report = audit([
      {
        ...base,
        id: 'computed',
        copy: 'Your presence, resolved.',
        nature: 'outcome',
        evidence: { class: 'computed', slot: 'presence-signals' },
      },
      {
        ...base,
        id: 'monitoring',
        copy: 'Continuous monitoring.',
        nature: 'capability',
        capabilityIds: ['profile-monitoring'],
      },
    ]);
    expect(report.claims.map(claim => claim.status)).toEqual([
      'admissible',
      'uncertified-capability',
    ]);
    expect(report.evidenceCounts.computed).toBe(1);
  });

  it('requires offers to quote offer-truth and positioning to stay uncheckable', () => {
    const report = audit([
      { ...base, id: 'offer-ok', copy: 'Free forever.', nature: 'offer' },
      { ...base, id: 'offer-bad', copy: 'Cheap forever.', nature: 'offer' },
      {
        ...base,
        id: 'pos',
        copy: 'The best link in bio',
        nature: 'positioning',
      },
    ]);
    expect(report.claims.map(claim => claim.status)).toEqual([
      'admissible',
      'unbacked-offer',
      'checkable-positioning',
    ]);
  });

  it('requests paid-outcome proof for a paywall step with none', () => {
    const report = audit([
      {
        ...base,
        step: 'upgrade',
        route: '/billing',
        id: 'price',
        copy: 'Free forever.',
        nature: 'offer',
      },
    ]);
    expect(report.prooflessPaywallSteps).toEqual(['upgrade', 'pricing']);
    expect(
      report.proofRequests.map(request => [request.claimId, request.generator])
    ).toContainEqual(['golden-path.upgrade.paid-outcome', 'dogfood']);
  });
});

describe('golden-path claim inventory', () => {
  it('quotes every claim verbatim from the file that renders it', () => {
    for (const claim of GOLDEN_PATH_CLAIMS) {
      const source = readFileSync(path.join(REPO_ROOT, claim.source), 'utf8');
      expect(source, `${claim.id} in ${claim.source}`).toContain(claim.copy);
    }
  });

  it('inventories every checkable or numeric string in golden-path copy', () => {
    const inventoried = GOLDEN_PATH_CLAIMS.map(claim => claim.copy);
    const registryClaims = listProductTruthClaims();
    const strings = collectStrings({
      homepage: HOMEPAGE_IDENTITY_COPY,
      pricing: MARKETING_PRICING_PLANS,
      taglines: [
        ENTITLEMENT_REGISTRY.free.marketing.tagline,
        ENTITLEMENT_REGISTRY.pro.marketing.tagline,
      ],
    });
    const uncovered = strings.filter(
      text =>
        (isClaimBearing(text) || isNumericCopy(text)) &&
        !inventoried.some(copy => text.includes(copy)) &&
        !resolvesToClaim(text, registryClaims)
    );
    expect(uncovered).toEqual([]);
  });

  it('has no invented numbers, unbacked offers or checkable positioning', () => {
    const failures = liveReport().claims.filter(claim =>
      HARD_FAIL_STATUSES.includes(claim.status)
    );
    expect(failures).toEqual([]);
  });

  it('proof gaps and uncertified claims only shrink against the baseline', () => {
    const report = liveReport();
    const baseline = JSON.parse(
      readFileSync(BASELINE_PATH, 'utf8')
    ) as Baseline;
    const open = Object.fromEntries(
      [
        ...report.claims
          .filter(claim => claim.status !== 'admissible')
          .map(claim => [claim.id, claim.status]),
        ...report.prooflessPaywallSteps.map(step => [
          `${step}.paid-outcome`,
          'proofless-paywall',
        ]),
      ].sort()
    ) as Record<string, string>;
    const added = Object.keys(open).filter(id => !(id in baseline.open));
    expect(added, 'new proof gaps: add evidence, do not baseline').toEqual([]);
    const stale = Object.keys(baseline.open).filter(id => !(id in open));
    if (UPDATE && stale.length > 0) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ ...baseline, open }, null, 2)}\n`
      );
      return;
    }
    expect(
      stale,
      'resolved gaps: rerun with UPDATE_GOLDEN_PATH_PROOF=1'
    ).toEqual([]);
  });

  it('keeps every wanted claim out of rendered copy until its proof lands', () => {
    const ids = WANTED_CLAIMS.map(wanted => wanted.id);
    expect(new Set(ids).size).toBe(ids.length);
    const requests = liveReport().proofRequests;
    for (const wanted of WANTED_CLAIMS) {
      expect(wanted.owner).toMatch(/^JOV-\d+$/u);
      expect(wanted.unlocks.length).toBeGreaterThan(0);
      expect(
        requests.find(request => request.claimId === `wanted.${wanted.id}`)
          ?.generator
      ).toBe(wanted.generator);
      expect(
        GOLDEN_PATH_CLAIMS.some(claim => claim.copy === wanted.statement)
      ).toBe(false);
    }
  });

  it('names a generator for every open proof request', () => {
    for (const request of liveReport().proofRequests) {
      expect(['computed', 'dogfood', 'pilot', 'research']).toContain(
        request.generator
      );
    }
  });

  it('keeps the funnel-judge report in sync', () => {
    const report = liveReport();
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (UPDATE) writeFileSync(REPORT_PATH, serialized);
    // Compare parsed JSON so formatter whitespace never fails the gate.
    expect(JSON.parse(readFileSync(REPORT_PATH, 'utf8'))).toEqual(
      JSON.parse(serialized)
    );
  });
});
