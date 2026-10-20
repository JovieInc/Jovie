import { describe, expect, it } from 'vitest';
import { CANONICAL_ASSERTION_BLOCKER } from '../music-resolver/parity/permissions';
import { ARTIST_IDENTITY_CONTRACT } from './artist-identity';
import { admitAssertion, projectAssertion } from './assertion';
import { defineSemanticContract } from './semantic-contract';

const contract = defineSemanticContract<string>({
  field: 'artists.name',
  version: 2,
  owner: 'platform-profiles',
  evaluate: raw =>
    typeof raw === 'string' && raw.trim()
      ? { ok: true, canonical: raw.trim() }
      : {
          ok: false,
          rejections: [{ code: 'invalid_name', detail: 'Invalid name' }],
        },
});
const context = {
  entity: { kind: 'artist', id: 'artist-1' },
  predicate: 'artists.name',
  polarity: 'positive',
  source: {
    id: 'fixture',
    recordId: 'record-1',
    uri: 'urn:fixture:record-1',
    revision: 'r1',
  },
  observedAt: '2026-10-15T00:00:00Z',
  effectiveAt: null,
  producer: { id: 'catalog-import', version: '2' },
  revisions: { contract: 2, canonical: 7 },
  quality: {
    assurance: {
      confidence: 0.8,
      calibration: { id: 'fixture-corpus', revision: '3' },
    },
    health: 'healthy',
    freshness: 'current',
    completeness: 0.25,
  },
  scope: { visibility: 'public', tenantId: null },
  rights: {
    policyId: 'fixture-policy',
    revision: '4',
    storage: 'allowed',
    publicDisplay: 'allowed',
    privateDisplay: 'allowed',
    retainUntil: null,
  },
};
const access = {
  audience: { kind: 'public' },
  now: '2026-10-15T01:00:00Z',
  deleted: false,
  policy: { id: 'fixture-policy', revision: '4', revoked: false },
};

describe('revisioned field assertion admission', () => {
  it('uses the existing contract and retains raw evidence and all lineage separately', () => {
    const assertion = admitAssertion(contract, ' Alex Lee ', context);
    expect(assertion.value).toBe(' Alex Lee ');
    expect(assertion.decision.canonical).toBe('Alex Lee');
    expect(assertion.decision.provenance).toEqual({
      producer: 'catalog-import@2',
      source: 'fixture',
    });
    expect(assertion).toMatchObject(context);
    expect(assertion.format).toBe('jovie.canonical-assertion/v1');
    expect(assertion.decision.contractVersion).toBe(2);
  });

  it('keeps contradictory and negative evidence without selecting a winner', () => {
    const observations = [
      admitAssertion(contract, 'Alex Lee', context),
      admitAssertion(contract, 'Another Name', {
        ...context,
        polarity: 'negative',
        source: { ...context.source, recordId: 'record-2' },
      }),
    ];
    expect(
      observations.map(row => [row.value, row.polarity, row.source.recordId])
    ).toEqual([
      ['Alex Lee', 'positive', 'record-1'],
      ['Another Name', 'negative', 'record-2'],
    ]);
    expect(projectAssertion(observations[1], access)).toMatchObject({
      polarity: 'negative',
      value: 'Another Name',
    });
    expect(context.revisions.canonical).toBe(7);
  });

  it('quarantines malformed values and never projects quarantined evidence', () => {
    const assertion = admitAssertion(contract, { name: 'Alex Lee' }, context);
    expect(assertion.value).toEqual({ name: 'Alex Lee' });
    expect(assertion.decision.status).toBe('quarantined');
    expect(assertion.decision.rejections[0].code).toBe('invalid_name');
    expect(projectAssertion(assertion, access)).toBeNull();
  });

  it('preserves existing artist identity validation', () => {
    const assertion = admitAssertion(
      ARTIST_IDENTITY_CONTRACT,
      { name: 'Alex Lee', spotifyId: 'bad-id' },
      {
        ...context,
        predicate: ARTIST_IDENTITY_CONTRACT.field,
        revisions: { contract: 1, canonical: 0 },
      }
    );
    expect(assertion.decision.status).toBe('quarantined');
    expect(assertion.decision.rejections.map(row => row.code)).toContain(
      'implausible_provider_id'
    );
  });

  it.each([
    null,
    { ...context, predicate: 'artists.spotify_id' },
    { ...context, revisions: { contract: 1, canonical: 7 } },
    { ...context, revisions: { contract: 2, canonical: -1 } },
    { ...context, source: { ...context.source, recordId: '' } },
    {
      ...context,
      source: { ...context.source, uri: 'https://fixture-user@example.com' },
    },
    { ...context, observedAt: 'yesterday' },
    { ...context, producer: { id: 'catalog-import' } },
    { ...context, scope: { visibility: 'private', tenantId: null } },
    {
      ...context,
      quality: {
        ...context.quality,
        assurance: { confidence: 0.99, calibration: null },
      },
    },
    { ...context, quality: { ...context.quality, completeness: 2 } },
    { ...context, rights: { ...context.rights, storage: 'unknown' } },
    { ...context, rights: { ...context.rights, storage: 'denied' } },
  ])(
    'fails closed on incomplete, mismatched or unauthorized lineage %#',
    invalid => {
      expect(() => admitAssertion(contract, 'Alex Lee', invalid)).toThrow(
        'Invalid canonical assertion'
      );
    }
  );

  it('admits unknown assurance independently of source health, freshness and completeness', () => {
    const assertion = admitAssertion(contract, 'Alex Lee', {
      ...context,
      quality: {
        assurance: { confidence: null, calibration: null },
        health: 'unavailable',
        freshness: 'stale',
        completeness: null,
      },
    });
    expect(assertion.decision.status).toBe('accepted');
    expect(assertion.quality).toEqual({
      assurance: { confidence: null, calibration: null },
      health: 'unavailable',
      freshness: 'stale',
      completeness: null,
    });
  });

  it('rejects non-JSON evidence', () => {
    expect(() => admitAssertion(contract, undefined, context)).toThrow();
    expect(() => admitAssertion(contract, new Date(), context)).toThrow();
  });
});

describe('field rights and privacy projection', () => {
  it('projects only the admitted field and its public interpretation', () => {
    const projected = projectAssertion(
      admitAssertion(contract, ' Alex Lee ', context),
      access
    );
    expect(projected).toEqual({
      entity: context.entity,
      predicate: context.predicate,
      polarity: 'positive',
      value: 'Alex Lee',
      observedAt: context.observedAt,
      effectiveAt: null,
      revisions: context.revisions,
    });
    expect(JSON.stringify(projected)).not.toContain('record-1');
    expect(JSON.stringify(projected)).not.toContain('fixture-policy');
  });

  it('isolates connected-account facts to the authorized tenant', () => {
    const assertion = admitAssertion(contract, 'Private name', {
      ...context,
      scope: { visibility: 'private', tenantId: 'tenant-1' },
    });
    expect(projectAssertion(assertion, access)).toBeNull();
    expect(
      projectAssertion(assertion, {
        ...access,
        audience: { kind: 'private', tenantId: 'tenant-2' },
      })
    ).toBeNull();
    expect(
      projectAssertion(assertion, {
        ...access,
        audience: { kind: 'private', tenantId: 'tenant-1' },
      })?.value
    ).toBe('Private name');
  });

  it.each(['denied', 'unknown'])(
    'denies %s display permission for each audience',
    permission => {
      const assertion = admitAssertion(contract, 'Alex Lee', {
        ...context,
        rights: {
          ...context.rights,
          publicDisplay: permission,
          privateDisplay: permission,
        },
      });
      expect(projectAssertion(assertion, access)).toBeNull();
      const internalOnly = admitAssertion(contract, 'Alex Lee', {
        ...context,
        rights: { ...context.rights, publicDisplay: permission },
      });
      expect(
        projectAssertion(internalOnly, {
          ...access,
          audience: { kind: 'private', tenantId: 'tenant-1' },
        })?.value
      ).toBe('Alex Lee');
      expect(
        projectAssertion(assertion, {
          ...access,
          audience: { kind: 'private', tenantId: 'tenant-1' },
        })
      ).toBeNull();
    }
  );

  it.each([
    { ...access, deleted: true },
    { ...access, policy: { ...access.policy, revoked: true } },
    { ...access, policy: { ...access.policy, revision: '5' } },
    { ...access, policy: { ...access.policy, id: 'another-policy' } },
    { ...access, now: 'invalid' },
    { ...access, audience: { kind: 'private', tenantId: '' } },
  ])('denies erased, revoked, outdated or invalid access state %#', state => {
    expect(
      projectAssertion(admitAssertion(contract, 'Alex Lee', context), state)
    ).toBeNull();
  });

  it('expires storage permission at the exact retention boundary', () => {
    const assertion = admitAssertion(contract, 'Alex Lee', {
      ...context,
      rights: { ...context.rights, retainUntil: access.now },
    });
    expect(
      projectAssertion(assertion, { ...access, now: context.observedAt })?.value
    ).toBe('Alex Lee');
    expect(projectAssertion(assertion, access)).toBeNull();
  });

  it('keeps missing persistence visible without a closed PR lease', () => {
    expect(CANONICAL_ASSERTION_BLOCKER.owner).toBe('JOV-8470 / JOV-8503');
    expect(CANONICAL_ASSERTION_BLOCKER.lease).toBeUndefined();
  });
});
