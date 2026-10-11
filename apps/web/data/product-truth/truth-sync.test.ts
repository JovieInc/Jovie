import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listProductTruthClaims } from './claims';
import type { QuoteProof } from './proof';
import { PROOF_REGISTRY } from './proof';
import { type Capability, listCapabilities } from './registry';
import {
  buildTruthDigest,
  diffTruthDigest,
  hashClaim,
  hashProof,
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

const capabilityMutations: readonly [
  string,
  (value: Capability) => Capability,
][] = [
  ['maturity', value => ({ ...value, maturity: 'limited_testing' })],
  ['publication', value => ({ ...value, publication: 'unlisted' })],
  ['access', value => ({ ...value, access: 'open' })],
  [
    'content revision',
    value => ({
      ...value,
      marketing: { ...value.marketing!, contentRevision: '2026-10-01' },
    }),
  ],
  [
    'proof authorization',
    value => ({
      ...value,
      marketing: { ...value.marketing!, proofAuthorized: false },
    }),
  ],
];

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
    ).toMatchObject({
      added: [],
      removed: [],
      changed: [],
      addedCapabilities: [],
      removedCapabilities: [],
      changedCapabilities: [],
      addedProofs: [],
      removedProofs: [],
      changedProofs: [],
    });
    expect(isDigestInSync(diff)).toBe(true);
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
    expect(
      isDigestInSync(diffTruthDigest(null, buildTruthDigest([], [], [])))
    ).toBe(true);
  });

  it('requires a digest schema refresh without marking every route changed', () => {
    const current = buildTruthDigest(claims);
    const legacy = {
      version: 1,
      claims: current.claims,
      capabilities: current.capabilities,
    } as TruthDigest;
    const diff = diffTruthDigest(legacy, current);

    expect(diff.schemaChanged).toBe(true);
    expect(diff.addedCapabilities).toEqual([]);
    expect(diff.addedProofs).toEqual([]);
    expect(diff.affectedRoutes).toEqual([]);
    expect(isDigestInSync(diff)).toBe(false);
  });

  it('diffs changed and removed claims from a legacy digest without route metadata', () => {
    const current = buildTruthDigest(claims);
    const legacy = {
      version: 1,
      claims: current.claims,
      capabilities: current.capabilities,
    } as TruthDigest;

    const changed = diffTruthDigest(
      legacy,
      buildTruthDigest(
        claims.map(claim =>
          claim.id === 'offer.pro.price'
            ? { ...claim, statement: '$1/mo' }
            : claim
        )
      )
    );
    expect(changed.schemaChanged).toBe(true);
    expect(changed.changed).toEqual(['offer.pro.price']);
    expect(changed.affectedRoutes).toEqual(['/pricing', '/product']);

    const removed = diffTruthDigest(
      legacy,
      buildTruthDigest(
        claims.filter(claim => claim.id !== 'capability.pay.access-label')
      )
    );
    expect(removed.schemaChanged).toBe(true);
    expect(removed.removed).toEqual(['capability.pay.access-label']);
    expect(removed.affectedRoutes).toEqual(['/pay']);
  });

  it('hashClaim is stable and sensitive to evidence fields', () => {
    const claim = { ...baseClaim };
    expect(hashClaim(claim)).toBe(hashClaim({ ...claim }));
    expect(hashClaim(claim)).not.toBe(
      hashClaim({ ...claim, citation: 'new evidence' })
    );
    expect(hashClaim({ ...claim, validUntil: '2027-01-01' })).not.toBe(
      hashClaim({ ...claim, validUntil: '2027-01-02' })
    );
  });

  it.each(capabilityMutations)(
    'marks the capability route changed when %s changes with claim text fixed',
    (_label, mutate) => {
      const claim = claims.find(
        item => item.id === 'capability.pay.artist-payment-surface'
      )!;
      const capability = listCapabilities().find(item => item.id === 'pay')!;
      const previous = buildTruthDigest([claim], [capability], []);
      const diff = diffTruthDigest(
        previous,
        buildTruthDigest([claim], [mutate(capability)], [])
      );

      expect(diff.changed).toEqual([]);
      expect(diff.changedCapabilities).toEqual(['pay']);
      expect(diff.affectedRoutes).toEqual(['/pay']);
      expect(isDigestInSync(diff)).toBe(false);
    }
  );

  it('reports removed and added evidence routes for a changed capability', () => {
    const claim = claims.find(
      item => item.id === 'capability.pay.artist-payment-surface'
    )!;
    const capability = listCapabilities().find(item => item.id === 'pay')!;
    const previous = buildTruthDigest(
      [claim],
      [
        {
          ...capability,
          evidence: { ...capability.evidence, routes: ['/review-old-route'] },
        },
      ],
      []
    );
    const next = buildTruthDigest(
      [claim],
      [
        {
          ...capability,
          evidence: { ...capability.evidence, routes: ['/review-new-route'] },
        },
      ],
      []
    );

    const diff = diffTruthDigest(previous, next);
    expect(diff.changedCapabilities).toEqual(['pay']);
    expect(diff.affectedRoutes).toEqual([
      '/pay',
      '/review-new-route',
      '/review-old-route',
    ]);
  });

  it('marks proof evidence revision and withdrawal against only its capability route', () => {
    const proof = PROOF_REGISTRY.find(
      item => item.id === 'product-profile-subscribe-capture'
    )!;
    const claim = claims.find(item => item.id === proof.claimId)!;
    const capability = listCapabilities().find(
      item => item.id === claim.capabilityId
    )!;
    const previous = buildTruthDigest([claim], [capability], [proof]);
    const revised = {
      ...proof,
      artifact: { ...proof.artifact, capturedAt: '2026-10-01' },
    };
    const revisedDiff = diffTruthDigest(
      previous,
      buildTruthDigest([claim], [capability], [revised])
    );

    expect(revisedDiff.changedProofs).toEqual([proof.id]);
    expect(revisedDiff.affectedRoutes).toEqual(['/artist-profiles']);
    expect(revisedDiff.affectedRoutes).not.toContain('/pay');

    const withdrawalDiff = diffTruthDigest(
      previous,
      buildTruthDigest([claim], [capability], [])
    );
    expect(withdrawalDiff.removedProofs).toEqual([proof.id]);
    expect(withdrawalDiff.affectedRoutes).toEqual(['/artist-profiles']);
    expect(hashProof(proof)).not.toBe(hashProof(revised));

    const expiringQuote = {
      recordType: 'proof',
      id: 'fixture.expiring-quote',
      kind: 'quote',
      claimId: claim.id,
      verbatimText: 'A short approved quote.',
      personOrRole: 'Artist',
      consent: { recordId: 'fixture.consent', grantedAt: '2026-09-01' },
      source: 'verified interview',
      validUntil: '2026-12-31',
    } as const satisfies QuoteProof;
    expect(hashProof(expiringQuote)).not.toBe(
      hashProof({ ...expiringQuote, validUntil: '2027-01-01' })
    );
  });
});
