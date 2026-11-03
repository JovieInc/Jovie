import { describe, expect, it } from 'vitest';
import {
  loadConfig,
  matchTerms,
  withoutAllowedPhrases,
} from '../../../scripts/invariants/icp-language/match.mjs';
import {
  allowsPinchZoom,
  COMPARATIVE_BENCHMARK,
  COMPARATIVE_CLAIM_RECEIPTS,
  COMPARATIVE_CLAIMS,
  comparativeAnswer,
  comparativeRatio,
  evaluateComparativeClaim,
  hasMusicMarkup,
  median,
  registrableDomain,
  renderComparativeClaim,
  renderedComparativeClaims,
  thirdPartyHosts,
} from './comparative-claims';
import { validatePublishedClaimReceipts } from './published-claims';

describe('comparative claims registry', () => {
  it('holds at its own baseline with a real margin', () => {
    for (const claim of COMPARATIVE_CLAIMS) {
      const result = evaluateComparativeClaim(claim, claim.baseline);
      expect(result.holds, `${claim.id}: ${result.reason}`).toBe(true);
    }
  });

  it('keeps the spread consistent with the baseline medians', () => {
    for (const claim of COMPARATIVE_CLAIMS) {
      const [jLow, jHigh] = claim.spread.jovie;
      const [cLow, cHigh] = claim.spread.competitor;
      expect(claim.baseline.jovie).toBeGreaterThanOrEqual(jLow);
      expect(claim.baseline.jovie).toBeLessThanOrEqual(jHigh);
      expect(claim.baseline.competitor).toBeGreaterThanOrEqual(cLow);
      expect(claim.baseline.competitor).toBeLessThanOrEqual(cHigh);
    }
  });

  it('marks a claim robust only when its observed ranges do not overlap', () => {
    for (const claim of COMPARATIVE_CLAIMS) {
      const worstJovie = Math.max(...claim.spread.jovie);
      const bestJovie = Math.min(...claim.spread.jovie);
      const worstCompetitor = Math.min(...claim.spread.competitor);
      const bestCompetitor = Math.max(...claim.spread.competitor);
      const separated =
        claim.direction === 'lower-is-better'
          ? worstJovie < worstCompetitor
          : bestJovie > bestCompetitor;
      if (claim.robustness === 'robust') {
        expect(separated, `${claim.id} overlaps but is marked robust`).toBe(
          true
        );
      }
    }
  });

  it('keeps generated claims and the FAQ within the general-page copy policy', () => {
    const config = loadConfig();
    for (const text of [...renderedComparativeClaims(), comparativeAnswer()]) {
      expect(
        matchTerms(
          withoutAllowedPhrases(text, config),
          config.terms,
          config.suppressedPrefixes
        ),
        text
      ).toEqual([]);
    }
    for (const text of renderedComparativeClaims()) {
      expect(text).not.toMatch(/\{[a-z]+\}/u);
      expect(text.length).toBeLessThan(120);
    }
    expect(renderComparativeClaim(COMPARATIVE_CLAIMS[0])).toBe(
      'Main content appears 6x faster than on Linktree.'
    );
  });

  it('never rounds a published figure above the measurement', () => {
    const lcp = COMPARATIVE_CLAIMS[0];
    const ratio = comparativeRatio(lcp.direction, lcp.baseline);
    const published = Number(/(\d+)x/u.exec(renderComparativeClaim(lcp))?.[1]);
    expect(published).toBeLessThanOrEqual(ratio);
    const weight = COMPARATIVE_CLAIMS.find(c => c.metric === 'total-bytes');
    const pct = Number(
      /(\d+)%/u.exec(renderComparativeClaim(weight as never))?.[1]
    );
    expect(pct).toBeLessThanOrEqual(
      (1 - 1 / comparativeRatio('lower-is-better', weight?.baseline as never)) *
        100
    );
  });

  it('flags a claim when the margin collapses or the measurement is invalid', () => {
    const lcp = COMPARATIVE_CLAIMS[0];
    expect(
      evaluateComparativeClaim(lcp, { jovie: 9000, competitor: 10_000 }).holds
    ).toBe(false);
    expect(
      evaluateComparativeClaim(lcp, { jovie: Number.NaN, competitor: 1 }).holds
    ).toBe(false);
  });

  it('requires an exact zero for the no-third-party claim', () => {
    const thirdParty = COMPARATIVE_CLAIMS.find(
      c => c.metric === 'third-party-hosts'
    );
    expect(
      evaluateComparativeClaim(thirdParty as never, { jovie: 0, competitor: 5 })
        .holds
    ).toBe(true);
    expect(
      evaluateComparativeClaim(thirdParty as never, { jovie: 1, competitor: 5 })
        .holds
    ).toBe(false);
  });

  it('is a current publish-safe receipt set with the method beside the figures', () => {
    const ids = COMPARATIVE_CLAIMS.map(claim => claim.id);
    expect(
      validatePublishedClaimReceipts(ids, new Date('2026-11-01T00:00:00Z'))
    ).toEqual([]);
    expect(Object.keys(COMPARATIVE_CLAIM_RECEIPTS).sort()).toEqual(
      [...ids].sort()
    );
    const answer = comparativeAnswer();
    expect(answer).toContain(COMPARATIVE_BENCHMARK.measuredAt);
    expect(answer).toContain('five alternating runs');
    expect(answer).toContain(COMPARATIVE_BENCHMARK.buildSha.slice(0, 10));
  });

  it('expires on schedule so stale numbers cannot keep publishing', () => {
    const ids = COMPARATIVE_CLAIMS.map(claim => claim.id);
    const issues = validatePublishedClaimReceipts(
      ids,
      new Date('2026-11-26T00:00:00Z')
    );
    expect(issues.map(issue => issue.code)).toContain('expired');
  });
});

describe('measurement helpers', () => {
  it('treats first-party subdomains as first party and counts the rest', () => {
    expect(registrableDomain('ugc.production.linktr.ee')).toBe('linktr.ee');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(
      thirdPartyHosts('https://linktr.ee/timwhite', [
        'https://linktr.ee/timwhite',
        'https://assets.production.linktr.ee/a.js',
        'https://connect.facebook.net/en_US/fbevents.js',
        'https://www.facebook.com/tr',
        'data:image/png;base64,AAAA',
      ])
    ).toEqual(['connect.facebook.net', 'www.facebook.com']);
    expect(
      thirdPartyHosts('https://jov.ie/tim', ['https://jov.ie/_next/a.js'])
    ).toEqual([]);
  });

  it('reads the viewport the way WCAG 1.4.4 does', () => {
    expect(
      allowsPinchZoom('width=device-width, initial-scale=1, maximum-scale=5')
    ).toBe(true);
    expect(
      allowsPinchZoom(
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      )
    ).toBe(false);
    expect(allowsPinchZoom('width=device-width, maximum-scale=1')).toBe(false);
    expect(allowsPinchZoom(null)).toBe(true);
  });

  it('detects music markup in JSON-LD, including multi-type nodes', () => {
    expect(
      hasMusicMarkup([
        '{"@graph":[{"@type":["MusicGroup","Person"],"name":"Tim"}]}',
      ])
    ).toBe(true);
    expect(hasMusicMarkup(['{"@type":"Person","name":"Tim"}'])).toBe(false);
  });

  it('takes a true median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});
