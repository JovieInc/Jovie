import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listProductTruthClaims } from './claims';
import {
  buildTruthDigest,
  diffTruthDigest,
  hashClaim,
  isDigestInSync,
  type TruthDigest,
} from './truth-sync';

const baseClaim = {
  id: 'fixture.claim',
  capabilityId: 'public-profile',
  statement: 'Fixture statement',
  kind: 'capability',
  source: 'feature',
} as const;

describe('truth-sync digest', () => {
  const claims = listProductTruthClaims();

  it('the committed digest matches the current claims', () => {
    const committed = JSON.parse(
      readFileSync(path.join(__dirname, 'claim-digest.gen.json'), 'utf8')
    ) as TruthDigest;
    const diff = diffTruthDigest(committed, buildTruthDigest(claims));
    expect(
      diff,
      'run `pnpm factory:truth-sync --write` and re-render affected routes'
    ).toMatchObject({ added: [], removed: [], changed: [] });
  });

  it('hashes change when a statement changes and report affected routes', () => {
    const previous = buildTruthDigest(claims);
    const edited = claims.map(claim =>
      claim.id === 'offer.pro.price' ? { ...claim, statement: '$1/mo' } : claim
    );
    const diff = diffTruthDigest(previous, buildTruthDigest(edited));
    expect(diff.changed).toEqual(['offer.pro.price']);
    expect(diff.affectedRoutes).toEqual(['/pricing', '/product']);
    expect(isDigestInSync(diff)).toBe(false);
  });

  it('reports added and removed claims with their routes', () => {
    const previous = buildTruthDigest(claims);
    const next = buildTruthDigest([
      ...claims.filter(claim => claim.id !== 'capability.pay.access-label'),
      { ...baseClaim, id: 'capability.cli.fixture', capabilityId: 'cli' },
    ]);
    const diff = diffTruthDigest(previous, next);
    expect(diff.added).toEqual(['capability.cli.fixture']);
    expect(diff.removed).toEqual(['capability.pay.access-label']);
    expect(diff.affectedRoutes).toEqual(['/cli', '/pay']);
  });

  it('treats a missing digest as everything added', () => {
    const diff = diffTruthDigest(null, buildTruthDigest(claims));
    expect(diff.added).toHaveLength(claims.length);
    expect(isDigestInSync(diffTruthDigest(null, buildTruthDigest([])))).toBe(
      true
    );
  });

  it('hashClaim is stable and sensitive to evidence fields', () => {
    const claim = { ...baseClaim };
    expect(hashClaim(claim)).toBe(hashClaim({ ...claim }));
    expect(hashClaim(claim)).not.toBe(
      hashClaim({ ...claim, citation: 'new evidence' })
    );
  });
});
