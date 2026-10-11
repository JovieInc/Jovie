import { describe, expect, it } from 'vitest';
import { composeProofBrief } from './compose';
import {
  type LedgerEntry,
  type ProofFeedEntry,
  type RollingFeedRequest,
  rollingWindow,
  selectProofCandidates,
} from './feed';
import {
  AS_OF,
  JOVIE_ENTITY_ID,
  makeEvent,
  TIM_ARTIST_ENTITY_ID,
} from './fixtures';

/**
 * Rolling proof feed tests (JOV-7215). Dogfood evidence is the existing
 * Jovie/Tim proof-brief events lifted into feed records with provenance.
 */

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) =>
  new Date(Date.parse(AS_OF) - d * DAY).toISOString();

function feedEntry(
  o: Partial<ProofFeedEntry> &
    Pick<ProofFeedEntry, 'id' | 'did' | 'subjectEntityId'>
): ProofFeedEntry {
  return {
    ...makeEvent(o),
    evidenceType: 'execution',
    attributionClass: 'execution-receipt',
    provenance: { source: 'release-receipts' },
    ...o,
  };
}

const DOGFOOD_FEED: readonly ProofFeedEntry[] = [
  feedEntry({
    id: 'ev-feed-load-time',
    revision: 'r3',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'shipped a faster public artist page',
    changed: 'median load time fell from 420 ms to 310 ms over 7d',
    attribution: 'direct',
    evidenceType: 'performance',
    attributionClass: 'attributed',
    metric: {
      predicate: 'p50-load-ms',
      label: 'Median load time',
      before: 420,
      after: 310,
      unit: 'ms',
      window: '7d',
    },
    provenance: {
      source: 'product-telemetry',
      sourceRevision: 'dash-2026-09-29',
      deploymentReceipt: 'deploy_v3k9',
    },
    observedAt: daysAgo(1),
    audienceRelevance: { investor: 0.9, founder: 0.8, internal: 0.8 },
  }),
  feedEntry({
    id: 'ev-feed-waitlist',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'gated waitlist auto-admission on open cohort learnings',
    evidenceType: 'capability',
    provenance: {
      source: 'release-receipts',
      sourceRevision: 'r1',
      deploymentReceipt: 'deploy_x2m4',
    },
    observedAt: daysAgo(2),
    audienceRelevance: { investor: 0.7, founder: 0.9 },
  }),
  feedEntry({
    id: 'ev-feed-proof-claim-fix',
    subjectEntityId: JOVIE_ENTITY_ID,
    did: 'fixed the proof-claim button so it stays clear of the consent card',
    attribution: 'direct',
    observedAt: daysAgo(3),
    audienceRelevance: { investor: 0.45, internal: 0.5 },
  }),
];

const INVESTOR_REQUEST: RollingFeedRequest = {
  audience: 'investor',
  subjectEntityId: JOVIE_ENTITY_ID,
  asOf: AS_OF,
};

function disposition(ledger: readonly LedgerEntry[], id: string) {
  return ledger.find(l => l.entryId === id);
}

describe('rollingWindow', () => {
  it('derives explicit bounds only from the request', () => {
    const w = rollingWindow('2026-09-29', 7);
    expect(w).toEqual({
      start: '2026-09-22T00:00:00.000Z',
      end: '2026-09-29T00:00:00.000Z',
      windowDays: 7,
    });
  });
});

describe('selectProofCandidates — dogfood candidate set', () => {
  it('produces a deterministic 7-day candidate set with a full ledger', () => {
    const result = selectProofCandidates(INVESTOR_REQUEST, DOGFOOD_FEED);
    expect(result.hero?.id).toBe('ev-feed-load-time');
    expect(result.supporting.map(s => s.id)).toEqual([
      'ev-feed-waitlist',
      'ev-feed-proof-claim-fix',
    ]);
    expect(result.candidates.map(c => c.id)).toEqual([
      'ev-feed-load-time',
      'ev-feed-waitlist',
      'ev-feed-proof-claim-fix',
    ]);
    expect(result.ledger).toHaveLength(DOGFOOD_FEED.length);
    expect(result.ledger.every(l => l.disposition !== 'excluded')).toBe(true);
    // Deterministic: identical inputs, identical output.
    expect(selectProofCandidates(INVESTOR_REQUEST, DOGFOOD_FEED)).toEqual(
      result
    );
  });

  it('feeds the selected candidates through the certified composer', () => {
    const result = selectProofCandidates(INVESTOR_REQUEST, DOGFOOD_FEED);
    const { brief } = composeProofBrief(
      {
        audience: 'investor',
        subjectEntityId: JOVIE_ENTITY_ID,
        windowDays: 7,
        asOf: AS_OF,
        disclosureScope: result.disclosureScope,
      },
      result.candidates
    );
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.hero.eventId).toBe(result.hero?.id);
  });
});

describe('selectProofCandidates — exclusions', () => {
  it('excludes stale evidence outside the window', () => {
    const stale = feedEntry({
      id: 'ev-feed-stale',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'shipped a faster public artist page',
      observedAt: daysAgo(30),
      audienceRelevance: { investor: 0.95 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      stale,
    ]);
    expect(result.hero?.id).toBe('ev-feed-load-time');
    expect(disposition(result.ledger, 'ev-feed-stale')).toMatchObject({
      disposition: 'excluded',
      reason: 'out-of-window',
    });
  });

  it('excludes expired evidence even inside the window', () => {
    const expired = feedEntry({
      id: 'ev-feed-expired',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'ran a time-boxed promotion',
      observedAt: daysAgo(2),
      expiresAt: daysAgo(1),
      audienceRelevance: { investor: 0.9 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      expired,
    ]);
    expect(disposition(result.ledger, 'ev-feed-expired')).toMatchObject({
      disposition: 'excluded',
      reason: 'expired',
    });
  });

  it('excludes movement claims with no baseline — missing data is not zero', () => {
    const noBaseline = feedEntry({
      id: 'ev-feed-nobase',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured activation',
      changed: 'activation moved over 7d',
      attributionClass: 'observed',
      metric: {
        predicate: 'activation-rate',
        label: 'Activation rate',
        after: 18,
        unit: '%',
        denominator: 'new profiles',
        window: '7d',
      },
      audienceRelevance: { investor: 0.9 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      noBaseline,
    ]);
    expect(disposition(result.ledger, 'ev-feed-nobase')).toMatchObject({
      disposition: 'excluded',
      reason: 'missing-baseline',
    });
  });

  it('excludes unsupported causal claims', () => {
    const overclaim = feedEntry({
      id: 'ev-feed-causal',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'shipped a faster public artist page',
      changed: 'signups moved during the same week',
      attribution: 'direct',
      attributionClass: 'observed',
      audienceRelevance: { investor: 0.95 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      overclaim,
    ]);
    expect(disposition(result.ledger, 'ev-feed-causal')).toMatchObject({
      disposition: 'excluded',
      reason: 'unsupported-causal-claim',
    });
  });

  it('requires a deployment receipt for capability evidence', () => {
    const mergedOnly = feedEntry({
      id: 'ev-feed-merged',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'merged the new onboarding flow',
      evidenceType: 'capability',
      provenance: { source: 'release-receipts', sourceRevision: 'r2' },
      audienceRelevance: { investor: 0.9 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      mergedOnly,
    ]);
    expect(disposition(result.ledger, 'ev-feed-merged')).toMatchObject({
      disposition: 'excluded',
      reason: 'capability-without-deployment-receipt',
    });
  });
});

describe('selectProofCandidates — dedupe, collapse, conflicts', () => {
  it('dedupes the same underlying result reported by two sources', () => {
    const dupe = feedEntry({
      id: 'ev-feed-load-time-b',
      revision: 'r1',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured median load time',
      metric: DOGFOOD_FEED[0].metric,
      provenance: { source: 'synthetic-checks' },
      observedAt: daysAgo(2),
      audienceRelevance: { investor: 0.2 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      dupe,
    ]);
    expect(result.hero?.id).toBe('ev-feed-load-time');
    expect(disposition(result.ledger, 'ev-feed-load-time-b')).toMatchObject({
      disposition: 'deduplicated',
      foldedInto: 'ev-feed-load-time',
    });
  });

  it('excludes both sides of a conflicting verified metric', () => {
    const conflict = feedEntry({
      id: 'ev-feed-conflict',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured median load time',
      metric: {
        predicate: 'p50-load-ms',
        label: 'Median load time',
        before: 420,
        after: 900,
        unit: 'ms',
        window: '7d',
      },
      observedAt: daysAgo(1),
      audienceRelevance: { investor: 0.95 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      conflict,
    ]);
    for (const id of ['ev-feed-load-time', 'ev-feed-conflict']) {
      expect(disposition(result.ledger, id)).toMatchObject({
        disposition: 'excluded',
        reason: 'conflicting-sources',
      });
    }
  });

  it('treats same predicate with different denominators as incompatible', () => {
    const otherDenom = feedEntry({
      id: 'ev-feed-denom',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured conversion',
      metric: {
        predicate: 'signup-conversion-rate',
        label: 'Signup conversion rate',
        before: 10,
        after: 14,
        unit: '%',
        denominator: 'all visitors',
        window: '7d',
      },
      audienceRelevance: { investor: 0.9 },
    });
    const altDenom = feedEntry({
      id: 'ev-feed-denom-alt',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured conversion',
      metric: {
        predicate: 'signup-conversion-rate',
        label: 'Signup conversion rate',
        before: 30,
        after: 44,
        unit: '%',
        denominator: 'landing-page visitors only',
        window: '7d',
      },
      audienceRelevance: { investor: 0.85 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      otherDenom,
      altDenom,
    ]);
    expect(disposition(result.ledger, 'ev-feed-denom')).toMatchObject({
      disposition: 'excluded',
      reason: 'incompatible-denominator',
    });
    expect(disposition(result.ledger, 'ev-feed-denom-alt')).toMatchObject({
      disposition: 'excluded',
      reason: 'incompatible-denominator',
    });
  });

  it('collapses many technical changes into one user-visible capability', () => {
    const partA = feedEntry({
      id: 'ev-feed-cap-a',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'wired the recap email renderer',
      capabilityKey: 'cap:weekly-recap',
      audienceRelevance: { investor: 0.4 },
      observedAt: daysAgo(4),
    });
    const partB = feedEntry({
      id: 'ev-feed-cap-b',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'shipped the weekly recap email',
      capabilityKey: 'cap:weekly-recap',
      audienceRelevance: { investor: 0.8 },
      observedAt: daysAgo(1),
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      partA,
      partB,
    ]);
    expect(result.supporting.map(s => s.id)).toContain('ev-feed-cap-b');
    expect(result.candidates.map(c => c.id)).not.toContain('ev-feed-cap-a');
    expect(disposition(result.ledger, 'ev-feed-cap-a')).toMatchObject({
      disposition: 'collapsed',
      foldedInto: 'ev-feed-cap-b',
    });
  });
});

describe('selectProofCandidates — audience and privacy boundaries', () => {
  it('clamps selection to the audience disclosure ceiling', () => {
    const internalOnly = feedEntry({
      id: 'ev-feed-internal',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'reviewed churned artist accounts',
      disclosure: 'internal',
      observedAt: daysAgo(1),
      audienceRelevance: { investor: 0.99, internal: 0.6 },
    });
    const investor = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      internalOnly,
    ]);
    expect(investor.candidates.map(c => c.id)).not.toContain(
      'ev-feed-internal'
    );
    expect(disposition(investor.ledger, 'ev-feed-internal')?.reason).toBe(
      'disclosure-bound'
    );

    const internal = selectProofCandidates(
      { ...INVESTOR_REQUEST, audience: 'internal' },
      [DOGFOOD_FEED[0], internalOnly]
    );
    expect(internal.candidates.map(c => c.id)).toContain('ev-feed-internal');
  });

  it('excludes records the audience is not eligible for', () => {
    const founderOnly = feedEntry({
      id: 'ev-feed-founder',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'kept a sensitive operational metric inside the company',
      disclosure: 'internal',
      eligibleAudiences: ['founder', 'internal'],
      observedAt: daysAgo(1),
      audienceRelevance: { investor: 0.95, founder: 0.9 },
    });
    const result = selectProofCandidates(
      { ...INVESTOR_REQUEST, audience: 'manager' },
      [DOGFOOD_FEED[0], founderOnly]
    );
    expect(disposition(result.ledger, 'ev-feed-founder')).toMatchObject({
      disposition: 'excluded',
      reason: 'audience-not-eligible',
    });
  });

  it('never leaks a private customer record into an investor candidate set', () => {
    const privateRecord = feedEntry({
      id: 'ev-feed-private',
      subjectEntityId: TIM_ARTIST_ENTITY_ID,
      subjectName: 'Tim White',
      did: 'earned $12,400 from a private brand deal',
      disclosure: 'private',
      observedAt: daysAgo(1),
      audienceRelevance: { investor: 0.95, customer: 0.9 },
    });
    const result = selectProofCandidates(
      { ...INVESTOR_REQUEST, subjectEntityId: TIM_ARTIST_ENTITY_ID },
      [privateRecord]
    );
    expect(result.hero).toBeUndefined();
    expect(result.candidates).toHaveLength(0);
    expect(disposition(result.ledger, 'ev-feed-private')).toMatchObject({
      disposition: 'excluded',
      reason: 'disclosure-bound',
    });
  });
});

describe('selectProofCandidates — weak evidence and caveats', () => {
  it('returns no hero and fewer items when evidence is weak', () => {
    const weak = feedEntry({
      id: 'ev-feed-weak',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'renamed an internal config flag',
      audienceRelevance: { investor: 0.2 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [weak]);
    expect(result.hero).toBeUndefined();
    expect(result.supporting).toHaveLength(0);
    expect(result.candidates).toHaveLength(0);
    expect(result.ledger).toHaveLength(1);
  });

  it('surfaces a contradicted in-window metric as a caveat', () => {
    const contradicted = feedEntry({
      id: 'ev-feed-contra',
      subjectEntityId: JOVIE_ENTITY_ID,
      status: 'contradicted',
      did: 'measured median load time',
      metric: {
        predicate: 'p50-load-ms',
        label: 'Median load time',
        before: 420,
        after: 900,
        unit: 'ms',
        window: '7d',
      },
      observedAt: daysAgo(1),
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      contradicted,
    ]);
    expect(result.hero?.id).toBe('ev-feed-load-time');
    expect(result.caveats.join(' ')).toContain('ev-feed-contra');
    expect(result.caveats.join(' ')).toContain('contradicted');
  });

  it('records unavailable telemetry as ledger exclusions, never as zeros', () => {
    const unavailable = feedEntry({
      id: 'ev-feed-telemetry-down',
      subjectEntityId: JOVIE_ENTITY_ID,
      status: 'candidate',
      did: 'measured fan conversion',
      metric: {
        predicate: 'fan-conversion',
        label: 'Fan conversion',
        window: '7d',
      },
      provenance: { source: 'product-telemetry' },
      limitations: ['Telemetry pipeline unavailable during the window.'],
      audienceRelevance: { investor: 0.9 },
    });
    const result = selectProofCandidates(INVESTOR_REQUEST, [
      DOGFOOD_FEED[0],
      unavailable,
    ]);
    expect(disposition(result.ledger, 'ev-feed-telemetry-down')).toMatchObject({
      disposition: 'excluded',
      reason: 'not-verified',
    });
    expect(result.hero?.id).toBe('ev-feed-load-time');
  });
});
