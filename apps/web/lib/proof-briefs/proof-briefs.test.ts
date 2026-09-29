import { describe, expect, it } from 'vitest';
import { evaluateBrief } from '@/lib/proof-briefs/certify';
import {
  briefHashMatches,
  composeProofBrief,
} from '@/lib/proof-briefs/compose';
import {
  CONFLICTING_METRIC_EVENT,
  FILLER_EVENTS,
  JARGON_EVENT,
  JOVIE_ENTITY_ID,
  JOVIE_EVENTS,
  JOVIE_INVESTOR_REQUEST,
  makeEvent,
  OVERCLAIM_EVENT,
  STALE_EVENT,
  TIM_CUSTOMER_REQUEST,
  TIM_EVENTS,
} from '@/lib/proof-briefs/fixtures';
import type { ProofBrief } from '@/lib/proof-briefs/types';

const failChecks = (brief: ProofBrief, events = JOVIE_EVENTS) =>
  evaluateBrief(brief, events).filter(f => f.severity === 'fail');

describe('composeProofBrief', () => {
  it('certifies the Jovie investor dogfood brief', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, JOVIE_EVENTS);
    expect(brief).not.toBeNull();
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.hero.eventId).toBe('ev-jov-load-time');
    expect(brief?.hero.wording).toBe(
      'Shipped a faster public artist page. Median load time fell from 420 to 310 ms over 7d.'
    );
    expect(brief?.supporting.map(s => s.eventId)).toEqual([
      'ev-jov-waitlist-gate',
      'ev-jov-proof-claim',
    ]);
    expect(brief?.evidence).toEqual([
      { id: 'ev-jov-load-time', revision: 'r3' },
      { id: 'ev-jov-waitlist-gate', revision: 'r1' },
      { id: 'ev-jov-proof-claim', revision: 'r2' },
    ]);
  });

  it('keeps internal-only evidence out of the investor variant', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, JOVIE_EVENTS);
    expect(brief?.evidence.map(e => e.id)).not.toContain('ev-jov-churn-detail');
    expect(brief?.disclosureScope).toBe('public');
  });

  it('certifies Tim’s customer brief and preserves attribution caveats', () => {
    const { brief } = composeProofBrief(TIM_CUSTOMER_REQUEST, TIM_EVENTS);
    expect(brief).not.toBeNull();
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.hero.wording).toBe(
      'Your profile now gives fans one place to stream, buy and get updates.'
    );
    // Correlated metric keeps its limitation + the auto-attribution caveat.
    expect(brief?.limitations).toContain(
      'Visits include repeat views from the same fans.'
    );
    expect(brief?.limitations).toContain(
      'Observed in the same window; not attributed to this work.'
    );
  });

  it('never leaks private customer data into an investor variant', () => {
    const request = {
      ...TIM_CUSTOMER_REQUEST,
      audience: 'investor' as const,
      disclosureScope: 'public' as const,
    };
    const { brief } = composeProofBrief(request, TIM_EVENTS);
    // Every Tim event is 'private' → nothing eligible → fail closed.
    expect(brief).toBeNull();
  });

  it('fails closed when no event clears the hero bar', () => {
    const { brief, rejectedReason } = composeProofBrief(
      JOVIE_INVESTOR_REQUEST,
      FILLER_EVENTS
    );
    expect(brief).toBeNull();
    expect(rejectedReason).toContain('hero');
  });

  it('is immutable: material change invalidates the snapshot', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, JOVIE_EVENTS);
    expect(brief && briefHashMatches(brief)).toBe(true);
    const tampered = {
      ...brief!,
      hero: { ...brief!.hero, wording: 'We 10x’d everything.' },
    };
    expect(briefHashMatches(tampered)).toBe(false);
  });
});

describe('certification — negative fixtures', () => {
  it('rejects jargon-heavy wording even when the claim is true', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [JARGON_EVENT]);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, [JARGON_EVENT]).map(f => f.check)).toContain(
      'understandable'
    );
  });

  it('rejects unsupported causal language on correlated evidence', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      OVERCLAIM_EVENT,
    ]);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, [OVERCLAIM_EVENT]).map(f => f.check)).toContain(
      'no-overclaim'
    );
  });

  it('excludes stale evidence from the window', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      JOVIE_EVENTS[0],
      STALE_EVENT,
    ]);
    expect(brief?.evidence.map(e => e.id)).not.toContain('ev-neg-stale');
  });

  it('rejects when a conflicting metric is omitted', () => {
    const events = [JOVIE_EVENTS[0], CONFLICTING_METRIC_EVENT];
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, events);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, events).map(f => f.check)).toContain(
      'no-material-omission'
    );
  });

  it('rejects private evidence selected into a public brief', () => {
    // Composer clamps scope, so hand-build the violating draft to prove the
    // certifier is the backstop, not the composer.
    const { brief: customerBrief } = composeProofBrief(
      TIM_CUSTOMER_REQUEST,
      TIM_EVENTS
    );
    const leaked: ProofBrief = {
      ...customerBrief!,
      audience: 'investor',
      disclosureScope: 'public',
    };
    const checks = failChecks(leaked, TIM_EVENTS).map(f => f.check);
    expect(checks).toContain('disclosure-bound');
  });

  it('does not pad to three bullets with weak items', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      JOVIE_EVENTS[0],
      ...FILLER_EVENTS,
    ]);
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.supporting).toHaveLength(0);
  });

  it('rejects a brief missing a required denominator', () => {
    const noDenominator = makeEvent({
      id: 'ev-neg-denominator',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured waitlist conversion',
      changed: 'conversion rose from 12 to 18 over 7d',
      attribution: 'direct',
      metric: {
        predicate: 'waitlist-conversion-rate',
        label: 'Waitlist conversion rate',
        before: 12,
        after: 18,
        unit: '%',
        window: '7d',
      },
      audienceRelevance: { investor: 0.9 },
    });
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      noDenominator,
    ]);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, [noDenominator]).map(f => f.check)).toContain(
      'denominators'
    );
  });
});
