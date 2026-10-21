import { describe, expect, it } from 'vitest';
import { admitCanonicalChange, projectCanonicalChange } from './change-event';
import { defineSemanticContract } from './semantic-contract';

const contract = defineSemanticContract<string>({
  field: 'works.title',
  version: 1,
  owner: 'catalog',
  evaluate: raw =>
    typeof raw === 'string' && raw.trim()
      ? { ok: true, canonical: raw.trim() }
      : {
          ok: false,
          rejections: [{ code: 'invalid', detail: 'Invalid title' }],
        },
});
const context = {
  entity: { kind: 'release', id: 'work-1' },
  predicate: contract.field,
  polarity: 'positive',
  source: {
    id: 'authorized-fixture',
    recordId: 'private-source-record',
    uri: 'urn:fixture:private-evidence',
    revision: 'source-r2',
  },
  observedAt: '2026-10-20T12:01:00Z',
  effectiveAt: '2026-10-20T12:00:00Z',
  producer: { id: 'fixture-ingest', version: '1' },
  revisions: { contract: 1, canonical: 2 },
  quality: {
    assurance: {
      confidence: 0.99,
      calibration: { id: 'fixture-corpus', revision: '1' },
    },
    health: 'healthy',
    freshness: 'current',
    completeness: 0.5,
  },
  scope: { visibility: 'public', tenantId: null },
  rights: {
    policyId: 'fixture-policy',
    revision: 'r1',
    storage: 'allowed',
    publicDisplay: 'allowed',
    privateDisplay: 'allowed',
    retainUntil: null,
  },
};
const access = {
  tenantId: 'tenant-1',
  now: '2026-10-20T12:02:00Z',
  canonicalRevision: 2,
  deleted: false,
  policy: {
    id: 'fixture-policy',
    revision: 'r1',
    revoked: false,
    redistribution: 'allowed',
  },
};
const publication = {
  kind: 'publication',
  baselineAt: '2026-10-19T12:00:00Z',
  publishedAt: context.effectiveAt,
  maxObservationDelayMs: 300_000,
  edition: 'original',
  previouslyKnown: false,
  identity: {
    expectedArtistId: 'artist-1',
    observedArtistId: 'artist-1',
    expectedSourceArtistId: 'provider-artist-1',
    observedSourceArtistId: 'provider-artist-1',
  },
};
const change = {
  tenantId: access.tenantId,
  observationId: 'observation-1',
  evidenceRef: { id: 'evidence-1', revision: 'r1' },
  eventAt: '2026-10-20T12:01:30Z',
  verification: 'verified',
  reason: publication,
  corrects: null,
  supersedes: [],
};
function create(
  overrides: Record<string, unknown> = {},
  nextContext: unknown = context,
  before: { raw: unknown; context: unknown } | null = null
) {
  return admitCanonicalChange(contract, {
    before,
    after: { raw: ' New work ', context: nextContext },
    change: { ...change, ...overrides },
    access,
  });
}
const previous = {
  raw: 'Old title',
  context: {
    ...context,
    revisions: { contract: 1, canonical: 1 },
    observedAt: '2026-10-20T11:00:00Z',
  },
};

describe('canonical change event admission', () => {
  it('derives a replay-stable immutable event from admitted canonical evidence', () => {
    const event = create();
    expect(event).toMatchObject({
      format: 'jovie.canonical-change/v1',
      tenantId: 'tenant-1',
      type: 'new_release',
      entity: context.entity,
      revisions: { before: null, after: 2, contract: 1 },
      changedFields: ['works.title'],
      eventAt: change.eventAt,
      effectiveAt: context.effectiveAt,
      observedAt: context.observedAt,
      source: context.source,
      observationId: 'observation-1',
      evidenceRef: change.evidenceRef,
      verification: 'verified',
      assurance: context.quality.assurance,
      corrects: null,
      supersedes: [],
    });
    expect(event?.id).toMatch(/^ce_[a-f0-9]{64}$/);
    expect(create()?.id).toBe(event?.id);
    expect(create({ tenantId: 'tenant-2' })).toBeNull();
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event?.assertion.decision)).toBe(true);
    expect(() => Object.assign(event?.entity ?? {}, { id: 'wrong' })).toThrow();
    expect(context.entity.id).toBe('work-1');
  });

  it.each([
    [{ publishedAt: '2020-01-01T00:00:00Z' }, 'new_discovery'],
    [{ publishedAt: null }, 'new_discovery'],
    [{ publishedAt: publication.baselineAt }, 'new_discovery'],
    [{ maxObservationDelayMs: 1 }, 'delayed_observation'],
    [{ edition: 'reissue' }, 'reissue'],
    [{ previouslyKnown: true }, 'new_discovery'],
  ])(
    'distinguishes historical discovery, delayed observation and reissue %#',
    (delta, type) => {
      const effectiveAt =
        'publishedAt' in delta ? delta.publishedAt : context.effectiveAt;
      const event = create(
        { reason: { ...publication, ...delta } },
        { ...context, effectiveAt }
      );
      expect(event?.type).toBe(type);
    }
  );

  it('distinguishes a new video without inventing a release', () => {
    expect(
      create({}, { ...context, entity: { kind: 'video', id: 'video-1' } })?.type
    ).toBe('new_video');
    expect(
      create({}, { ...context, entity: { kind: 'artist', id: 'artist-1' } })
        ?.type
    ).toBe('new_discovery');
  });

  it.each(['ambiguous', 'rejected', 'unknown'])(
    'does not emit new work with %s identity',
    verification => {
      expect(create({ verification })).toBeNull();
    }
  );

  it.each(['observedArtistId', 'observedSourceArtistId'])(
    'rejects a same-name or merged identity mismatch in %s',
    field => {
      expect(
        create({
          reason: {
            ...publication,
            identity: {
              ...publication.identity,
              [field]: 'same-name-other-artist',
            },
          },
        })
      ).toBeNull();
    }
  );

  it('does not announce premieres or inconsistent publication evidence', () => {
    expect(
      create(
        { reason: { ...publication, publishedAt: '2026-10-21T12:00:00Z' } },
        { ...context, effectiveAt: '2026-10-21T12:00:00Z' }
      )
    ).toBeNull();
    expect(
      create({
        reason: { ...publication, publishedAt: '2026-10-20T11:59:00Z' },
      })
    ).toBeNull();
  });

  it('keeps known-work updates out of new-release notifications', () => {
    expect(create({}, context, previous)?.type).toBe('metadata_changed');
    expect(
      create({ reason: { kind: 'discovery' } }, context, previous)?.type
    ).toBe('metadata_changed');
    expect(
      create(
        { reason: { ...publication, edition: 'reissue' } },
        context,
        previous
      )?.type
    ).toBe('reissue');
  });

  it.each([
    ['availability', 'provider_availability_changed'],
    ['metric_anomaly', 'metric_anomaly'],
    ['withdrawal', 'withdrawn_work'],
  ])('classifies %s only for an existing work', (kind, type) => {
    expect(create({ reason: { kind } }, context, previous)?.type).toBe(type);
    expect(create({ reason: { kind } })).toBeNull();
  });

  it('requires correction lineage and never promotes an identity repair to new work', () => {
    const original = create();
    expect(original).not.toBeNull();
    const corrected = create(
      {
        reason: { kind: 'identity_correction' },
        corrects: original?.id,
        supersedes: [original?.id],
      },
      context,
      previous
    );
    expect(corrected?.type).toBe('identity_corrected');
    expect(corrected?.corrects).toBe(original?.id);
    expect(corrected?.supersedes).toEqual([original?.id]);
    expect(
      create({ reason: { kind: 'identity_correction' } }, context, previous)
    ).toBeNull();
    expect(
      create({ corrects: original?.id, supersedes: [original?.id] })
    ).toBeNull();
    expect(create({ supersedes: [original?.id] })).toBeNull();
    expect(
      create({ reason: { kind: 'metadata_correction' } }, context, previous)
    ).toBeNull();
    expect(
      create(
        {
          reason: { kind: 'discovery' },
          corrects: original?.id,
          supersedes: [original?.id],
        },
        context,
        previous
      )
    ).toBeNull();
    expect(() =>
      create({ corrects: original?.id, supersedes: [] }, context, previous)
    ).toThrow('Invalid canonical change');
    expect(() =>
      create({ supersedes: [original?.id, original?.id] }, context, previous)
    ).toThrow('Invalid canonical change');
  });

  it('invalidates a superseded observation even if its corrected display value is unchanged', () => {
    const original = create();
    const corrected = create(
      {
        reason: { kind: 'metadata_correction' },
        corrects: original?.id,
        supersedes: [original?.id],
      },
      context,
      { ...previous, raw: 'New work' }
    );
    expect(corrected).toMatchObject({
      type: 'metadata_changed',
      corrects: original?.id,
    });
  });

  it('uses JSON value equality independently of object key order', () => {
    const objectContract = defineSemanticContract({
      field: contract.field,
      version: 1,
      owner: 'catalog',
      evaluate: raw => ({ ok: true, canonical: raw }),
    });
    const next = { raw: { a: 1, b: 2 }, context };
    const event = admitCanonicalChange(objectContract, {
      before: null,
      after: next,
      change,
      access,
    });
    const reordered = admitCanonicalChange(objectContract, {
      before: null,
      after: { ...next, raw: { b: 2, a: 1 } },
      change,
      access,
    });
    expect(event?.id).toBe(reordered?.id);
    expect(
      admitCanonicalChange(objectContract, {
        before: { raw: next.raw, context: previous.context },
        after: { ...next, raw: { b: 2, a: 1 } },
        change,
        access,
      })
    ).toBeNull();
  });

  it('retains delayed correction time and prevents old event projection after a revision changes', () => {
    const original = create();
    const laterContext = {
      ...context,
      observedAt: '2026-10-21T12:00:00Z',
      revisions: { contract: 1, canonical: 3 },
    };
    const laterAccess = {
      ...access,
      now: '2026-10-21T12:02:00Z',
      canonicalRevision: 3,
    };
    const correction = admitCanonicalChange(contract, {
      before: { raw: 'New work', context },
      after: { raw: 'Corrected title', context: laterContext },
      change: {
        ...change,
        eventAt: '2026-10-21T12:01:00Z',
        reason: { kind: 'metadata_correction' },
        corrects: original?.id,
        supersedes: [original?.id],
      },
      access: laterAccess,
    });
    expect(correction).toMatchObject({
      type: 'metadata_changed',
      effectiveAt: context.effectiveAt,
      observedAt: laterContext.observedAt,
      revisions: { before: 2, after: 3 },
    });
    expect(projectCanonicalChange(original!, laterAccess)).toBeNull();
    expect(projectCanonicalChange(correction!, laterAccess)?.corrects).toBe(
      original?.id
    );
  });

  it('suppresses duplicate observations, equivalent canonical values and stale revisions', () => {
    expect(create({}, context, { raw: 'New work', context })).toBeNull();
    expect(create({}, context, { ...previous, raw: ' New work ' })).toBeNull();
    expect(
      create({}, context, {
        ...previous,
        context: { ...context, revisions: { contract: 1, canonical: 3 } },
      })
    ).toBeNull();
    expect(
      create({}, context, {
        ...previous,
        context: { ...context, entity: { kind: 'release', id: 'different' } },
      })
    ).toBeNull();
  });

  it('fails closed on malformed, quarantined, negative, stale or unavailable assertions', () => {
    expect(() => create({}, { ...context, observedAt: 'invalid' })).toThrow(
      'Invalid canonical assertion'
    );
    expect(
      admitCanonicalChange(contract, {
        before: null,
        after: { raw: null, context },
        change,
        access,
      })
    ).toBeNull();
    for (const delta of [
      { polarity: 'negative' },
      { quality: { ...context.quality, health: 'unavailable' } },
      { quality: { ...context.quality, freshness: 'stale' } },
    ])
      expect(create({}, { ...context, ...delta })).toBeNull();
  });

  it.each([
    { observationId: '' },
    { evidenceRef: null },
    { eventAt: 'yesterday' },
    { eventAt: '2026-10-20T11:00:00Z' },
    { eventAt: '2026-10-20T12:03:00Z' },
    { reason: { ...publication, maxObservationDelayMs: -1 } },
    { reason: { ...publication, initiator: 'paid-api' } },
    { corrects: 'arbitrary-id' },
    { supersedes: ['arbitrary-id'] },
    { canAutoCreateLinks: true },
  ])('rejects malformed or contradictory event context %#', invalid => {
    expect(() => create(invalid)).toThrow('Invalid canonical change');
  });
});

describe('permission-checked change projection at creation and delivery', () => {
  it('projects permitted canonical facts with opaque evidence references and no action grants', () => {
    const event = create();
    const projected = projectCanonicalChange(event!, access);
    expect(projected).toMatchObject({
      id: event?.id,
      type: 'new_release',
      entity: context.entity,
      changedFields: ['works.title'],
      payload: { predicate: 'works.title', value: 'New work' },
      verification: 'verified',
    });
    expect(projected?.observationRef).toMatch(/^evidence_[a-f0-9]{64}$/);
    const serialized = JSON.stringify(projected);
    for (const privateText of [
      'private-source-record',
      'urn:fixture',
      'fixture-ingest',
      'evidence-1',
      'observation-1',
      'fixture-corpus',
      'provider-artist-1',
      ' New work ',
      'canAutoCreateLinks',
      'publish',
      'outreach',
    ])
      expect(serialized).not.toContain(privateText);
    expect(projectCanonicalChange(event!, access)).toEqual(projected);
    expect(
      projectCanonicalChange(JSON.parse(JSON.stringify(event)), access)
    ).toEqual(projected);
    expect(
      projectCanonicalChange({ ...event!, type: 'identity_corrected' }, access)
    ).toBeNull();
    expect(
      projectCanonicalChange(event!, { ...access, now: '2026-10-20T11:00:00Z' })
    ).toBeNull();
    expect(projectCanonicalChange(event!, null)).toBeNull();
  });

  it('keeps absent confidence explicit without inventing calibration', () => {
    const event = create(
      {},
      {
        ...context,
        quality: {
          ...context.quality,
          assurance: { confidence: null, calibration: null },
        },
      }
    );
    expect(projectCanonicalChange(event!, access)).toMatchObject({
      confidence: null,
      calibrationRef: null,
    });
  });

  it.each([
    { tenantId: 'other-tenant' },
    { canonicalRevision: 3 },
    { canonicalRevision: 1 },
    { deleted: true },
    { policy: { ...access.policy, revoked: true } },
    { policy: { ...access.policy, id: 'different-policy' } },
    { policy: { ...access.policy, revision: 'r2' } },
    { policy: { ...access.policy, redistribution: 'denied' } },
    { policy: { ...access.policy, redistribution: 'unknown' } },
    { policy: { id: 'fixture-policy', revision: 'r1', revoked: false } },
  ])(
    'rechecks scope, revision and source rights on creation and replay %#',
    delta => {
      const currentAccess = { ...access, ...delta };
      expect(
        admitCanonicalChange(contract, {
          before: null,
          after: { raw: 'New work', context },
          change,
          access: currentAccess,
        })
      ).toBeNull();
      expect(projectCanonicalChange(create()!, currentAccess)).toBeNull();
    }
  );

  it('never projects private fields or assumes display permission grants redistribution', () => {
    for (const nextContext of [
      { ...context, scope: { visibility: 'private', tenantId: 'tenant-1' } },
      { ...context, rights: { ...context.rights, publicDisplay: 'denied' } },
      { ...context, rights: { ...context.rights, retainUntil: access.now } },
    ])
      expect(create({}, nextContext)).toBeNull();
  });

  it('enforces retention again on delayed delivery', () => {
    const event = create(
      {},
      {
        ...context,
        rights: { ...context.rights, retainUntil: '2026-10-20T13:00:00Z' },
      }
    );
    expect(event).not.toBeNull();
    expect(
      projectCanonicalChange(event!, { ...access, now: '2026-10-20T13:00:00Z' })
    ).toBeNull();
  });
});
