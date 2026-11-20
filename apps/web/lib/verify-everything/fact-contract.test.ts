import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseObservationLines } from '../../scripts/verify-everything/coverage';
import {
  buildCoverageReport,
  computeProfileCoverage,
  FACT_SPECS,
  factDisplay,
  type ProfileFactObservation,
} from './fact-contract';

const SQL = readFileSync(
  join(__dirname, '../../scripts/verify-everything/coverage.sql'),
  'utf8'
);

function observation(
  artist: ProfileFactObservation['artist'],
  work: ProfileFactObservation['work'] = {}
): ProfileFactObservation {
  return { profileId: 'p1', artist, work };
}

describe('fact contract registry', () => {
  it('has unique ids and a source, rule and resolver step for every fact', () => {
    const ids = FACT_SPECS.map(spec => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const spec of FACT_SPECS) {
      expect(spec.sources.length).toBeGreaterThan(0);
      expect(spec.verificationRule.length).toBeGreaterThan(10);
      expect(spec.resolverStep.length).toBeGreaterThan(0);
      expect(spec.minConfidence).toBeGreaterThan(0);
      expect(spec.minConfidence).toBeLessThanOrEqual(1);
    }
  });

  it('measures every sql-backed fact in coverage.sql, and nothing else', () => {
    const sqlIds = new Set(
      SQL.match(/'(artist|work)\.[a-z_.]+'/g)?.map(s => s.slice(1, -1))
    );
    const contractSql = FACT_SPECS.filter(spec => spec.producer === 'sql').map(
      spec => spec.id
    );
    for (const id of contractSql) expect(sqlIds, id).toContain(id);
    for (const id of sqlIds) expect(contractSql, id).toContain(id);
    for (const spec of FACT_SPECS.filter(s => s.producer === 'no_producer')) {
      expect(sqlIds.has(spec.id), spec.id).toBe(false);
    }
  });

  it('keeps the coverage query read-only', () => {
    expect(SQL).toContain('default_transaction_read_only = on');
    expect(SQL).not.toMatch(/\b(insert|update|delete|truncate|alter|drop)\s/i);
  });
});

describe('factDisplay', () => {
  const spec = { minConfidence: 0.85 };
  it('shows only verified facts at or above the floor', () => {
    expect(factDisplay('verified', null, spec)).toBe('show');
    expect(factDisplay('verified', 0.9, spec)).toBe('show');
    expect(factDisplay('verified', 0.6, spec)).toBe('confirm_one_tap');
  });
  it('never shows an unsure fact as true, and hides missing ones', () => {
    expect(factDisplay('found', 0.99, spec)).toBe('confirm_one_tap');
    expect(factDisplay('missing', null, spec)).toBe('hide');
    expect(factDisplay('not_applicable', null, spec)).toBe('hide');
  });
});

describe('computeProfileCoverage', () => {
  it('scores a fully verified tier-1 profile at 100% for tier 1', () => {
    const coverage = computeProfileCoverage(
      observation({
        'artist.spotify_identity': 'verified',
        'artist.display_name': 'verified',
        'artist.avatar': 'verified',
        'artist.catalog': 'verified',
      })
    );
    expect(coverage.byTier[1]).toMatchObject({
      foundShare: 1,
      verifiedShare: 1,
    });
    expect(coverage.gaps[0]?.startsWith('artist.')).toBe(true);
  });

  it('counts found as found but not verified', () => {
    const coverage = computeProfileCoverage(
      observation({
        'artist.spotify_identity': 'found',
        'artist.display_name': 'verified',
        'artist.avatar': 'missing',
        'artist.catalog': 'missing',
      })
    );
    expect(coverage.byTier[1]).toMatchObject({
      findable: 4,
      foundShare: 0.5,
      verifiedShare: 0.25,
    });
    expect(coverage.gaps.slice(0, 3)).toEqual([
      'artist.spotify_identity',
      'artist.avatar',
      'artist.catalog',
    ]);
  });

  it('keeps conditional not-applicable facts out of the denominator, never always facts', () => {
    const base = computeProfileCoverage(observation({}));
    const withNa = computeProfileCoverage(
      observation({
        'artist.tour_dates': 'not_applicable',
        'artist.genres': 'not_applicable',
      })
    );
    expect(withNa.overall.findable).toBe(base.overall.findable - 1);
    expect(withNa.gaps).toContain('artist.genres');
  });

  it('averages work facts per profile and excludes no-producer facts', () => {
    const coverage = computeProfileCoverage(
      observation(
        {},
        { 'work.upc': { verified: 0.5, found: 0.75, applicable: 4 } }
      )
    );
    expect(coverage.gaps).toContain('work.upc');
    expect(coverage.gaps).not.toContain('work.iswc');
    expect(coverage.gaps).not.toContain('artist.press');
  });
});

describe('buildCoverageReport', () => {
  it('ranks gaps tier first and lists contract facts with no producer', () => {
    const report = buildCoverageReport([
      observation({ 'artist.spotify_identity': 'missing' }),
      {
        ...observation({ 'artist.spotify_identity': 'verified' }),
        profileId: 'p2',
      },
    ]);
    expect(report.profiles).toBe(2);
    expect(report.gapRanking[0]?.tier).toBe(1);
    expect(report.noProducer).toEqual([
      'artist.press',
      'work.iswc',
      'work.versions',
    ]);
    expect(report.meanVerifiedShare).not.toBeNull();
  });

  it('parses psql output lines, skipping noise', () => {
    const parsed = parseObservationLines([
      'SET',
      JSON.stringify(observation({ 'artist.catalog': 'verified' })),
      '',
    ]);
    expect(parsed).toHaveLength(1);
    expect(buildCoverageReport(parsed).byTier[1].meanVerifiedShare).toBe(0.25);
  });
});
