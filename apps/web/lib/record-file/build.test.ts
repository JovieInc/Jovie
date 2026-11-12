import { describe, expect, it } from 'vitest';
import { buildRecordFile, type RecordFileBuildInput } from './build';
import {
  SYNTHETIC_AS_OF,
  syntheticEdges,
  syntheticEntities,
  syntheticRecord,
  syntheticSources,
} from './fixtures/synthetic-2015-single';

const baseInput: RecordFileBuildInput = {
  record: syntheticRecord,
  sources: syntheticSources,
  entities: syntheticEntities,
  edges: syntheticEdges,
  asOf: SYNTHETIC_AS_OF,
};

function ids(refs: readonly { sourceRecordId: string }[]): string[] {
  return refs.map(ref => ref.sourceRecordId);
}

describe('buildRecordFile', () => {
  const file = buildRecordFile(baseInput);

  it('describes the record from its memory entity and release edge', () => {
    expect(file.record).toEqual({
      entityId: 'rec-night-signal',
      kind: 'release',
      title: 'Night Signal',
      primaryArtist: 'Ada Vale',
      releaseDate: '2015-06-12T00:00:00.000Z',
    });
  });

  it('indexes paperwork by kind, each tag pointing back to its source', () => {
    expect(ids(file.tagsByKind.split_sheet)).toEqual(['src-split-sheet']);
    expect(ids(file.tagsByKind.split_change)).toEqual(['src-split-change']);
    expect(ids(file.tagsByKind.mastering)).toEqual(['src-master-ready']);
    expect(ids(file.tagsByKind.mix)).toEqual(['src-mix-v3']);
    expect(ids(file.tagsByKind.artwork)).toEqual(['src-artwork']);
    expect(ids(file.tagsByKind.distribution)).toEqual([
      'src-distro-live',
      'src-remix-wrong-artist',
    ]);
    expect(ids(file.tagsByKind.contract)).toEqual([
      'src-remix-lumen-sent',
      'src-remix-lumen-signed',
      'src-remix-tidewater-sent',
    ]);
    expect(ids(file.tagsByKind.remix)).toEqual([
      'src-remix-lumen-sent',
      'src-remix-lumen-signed',
      'src-remix-tidewater-sent',
      'src-remix-wrong-artist',
    ]);
    expect(
      file.tagsByKind.registration.map(ref => ref.tag.registrationTarget)
    ).toEqual(['publishing_admin', 'soundexchange']);
    expect(ids(file.tagsByKind.collaborator_thread)).toEqual([
      'src-split-sheet',
      'src-vocal-comp',
      'src-mix-v3',
    ]);
    expect(file.tagsByKind.sync).toEqual([]);

    const master = file.tagsByKind.mastering[0];
    expect(master).toMatchObject({
      sourceType: 'gmail_message',
      externalId: 'gmail:src-master-ready',
      date: '2015-04-01T16:00:00.000Z',
      sender: {
        name: 'Northside Mastering',
        domain: 'northside-mastering.example',
      },
      tag: { kind: 'mastering', reason: 'sender is a mastering house' },
    });
  });

  it('keeps unmatched sources as untagged instead of guessing', () => {
    expect(ids(file.untagged)).toEqual(['src-unrelated']);
  });

  it('orders the timeline by date with the kinds on each entry', () => {
    expect(ids(file.timeline)).toEqual(
      [...syntheticSources]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(source => source.id)
    );
    expect(file.timeline.at(-1)?.kinds).toEqual([]);
    expect(
      file.timeline.find(entry => entry.sourceRecordId === 'src-vocal-comp')
        ?.hints
    ).toEqual(['vocal']);
  });

  it('lists credited people and sender-inferred companies with their roles', () => {
    expect(
      file.people.map(person => [person.name, person.roles, person.origin])
    ).toEqual([
      ['Cass Ortega', ['mixer'], 'credit'],
      ['Harbor Lane Publishing', ['publisher_admin'], 'thread'],
      ['Juno Park', ['co_writer'], 'credit'],
      ['Milo Reyes', ['co_writer'], 'credit'],
      ['Northside Mastering', ['mastering_engineer'], 'thread'],
      ['Waveline Distribution', ['distributor'], 'thread'],
    ]);
    const waveline = file.people.find(p => p.name === 'Waveline Distribution');
    expect(waveline?.sourceRecordIds).toEqual([
      'src-distro-live',
      'src-remix-wrong-artist',
    ]);
    expect(waveline?.personKey).toBe('name:waveline distribution');
  });

  it('flags the gaps in the paperwork', () => {
    expect(
      file.gaps.map(gap => [
        gap.kind,
        gap.registrationTarget ?? null,
        gap.sourceRecordIds,
      ])
    ).toEqual([
      ['agreement_unsigned', null, ['src-remix-tidewater-sent']],
      ['wrong_artist_credit', null, ['src-remix-wrong-artist']],
      ['missing_registration', 'pro', []],
      ['missing_registration', 'youtube_content_id', []],
      ['unknown_vocalist_credit', null, ['src-vocal-comp']],
    ]);
  });

  it('never copies body-like metadata into the record file', () => {
    const serialized = JSON.stringify(file);
    expect(serialized).not.toContain('SYNTHETIC-BODY-MUST-NOT-APPEAR');
    expect(serialized).not.toContain('snippet');
  });

  it('clears the vocalist gap once a vocalist is credited', () => {
    const withVocalist = buildRecordFile({
      ...baseInput,
      entities: [
        ...syntheticEntities,
        {
          id: 'ent-vox',
          type: 'person',
          primaryName: 'Ivy Lane',
          metadata: {},
        },
      ],
      edges: [
        ...syntheticEdges,
        {
          fromEntityId: 'ent-vox',
          toEntityId: 'rec-night-signal',
          relation: 'vocalist',
          metadata: {},
        },
      ],
    });
    expect(withVocalist.gaps.map(gap => gap.kind)).not.toContain(
      'unknown_vocalist_credit'
    );
  });

  it('rejects entities that are not records', () => {
    expect(() =>
      buildRecordFile({
        ...baseInput,
        record: { id: 'x', type: 'person', primaryName: 'X', metadata: {} },
      })
    ).toThrow(/release or recording/);
  });

  it('reads Gmail-style From headers and falls back to the record date', () => {
    const single = buildRecordFile({
      ...baseInput,
      sources: [
        {
          id: 'src-header',
          sourceType: 'gmail_message',
          externalId: 'gmail:src-header',
          metadata: {
            subject: 'Final master',
            from: 'Northside Mastering <files@northside-mastering.invalid>',
            body: 'SYNTHETIC-BODY-MUST-NOT-APPEAR',
          },
          createdAt: new Date('2015-04-02T00:00:00.000Z'),
        },
      ],
    });
    expect(single.timeline[0]).toMatchObject({
      date: '2015-04-02T00:00:00.000Z',
      sender: {
        name: 'Northside Mastering',
        domain: 'northside-mastering.invalid',
      },
      kinds: ['mastering'],
    });
    const serialized = JSON.stringify(single);
    expect(serialized).not.toContain('files@');
    expect(serialized).not.toContain('SYNTHETIC-BODY-MUST-NOT-APPEAR');
  });
});

describe('buildRecordFile content consent', () => {
  const file = buildRecordFile(baseInput);

  it('defaults to unknown and reads artist-set consent from the entity', () => {
    const consent = Object.fromEntries(
      file.people.map(person => [person.name, person.featureConsent])
    );
    expect(consent).toEqual({
      'Cass Ortega': 'unknown',
      'Harbor Lane Publishing': 'unknown',
      'Juno Park': 'do_not_feature',
      'Milo Reyes': 'ok',
      'Northside Mastering': 'unknown',
      'Waveline Distribution': 'unknown',
    });
  });

  it('only offers ok people as nameable in content', () => {
    expect(file.content.nameable).toEqual([
      { personKey: 'ent-milo', name: 'Milo Reyes', roles: ['co_writer'] },
    ]);
  });

  it('asks before naming people whose consent is unknown', () => {
    expect(file.content.askBeforeNaming.map(person => person.name)).toEqual([
      'Cass Ortega',
      'Harbor Lane Publishing',
      'Northside Mastering',
      'Waveline Distribution',
    ]);
  });

  it('keeps do_not_feature people out of content but keeps their paperwork', () => {
    const contentNames = [
      ...file.content.nameable,
      ...file.content.askBeforeNaming,
    ].map(person => person.name);
    expect(contentNames).not.toContain('Juno Park');
    expect(JSON.stringify(file.content)).not.toContain('Juno');

    expect(file.people.find(p => p.name === 'Juno Park')).toMatchObject({
      roles: ['co_writer'],
      featureConsent: 'do_not_feature',
    });
    expect(
      file.tagsByKind.collaborator_thread.some(
        ref => ref.sender.name === 'Juno Park'
      )
    ).toBe(true);
  });

  it('lets an explicit consent map override entity metadata, by entity id or name key', () => {
    const overridden = buildRecordFile({
      ...baseInput,
      featureConsent: {
        'ent-milo': 'do_not_feature',
        'name:northside mastering': 'ok',
      },
    });
    expect(overridden.content.nameable.map(person => person.name)).toEqual([
      'Northside Mastering',
    ]);
    expect(
      overridden.content.askBeforeNaming.map(person => person.name)
    ).not.toContain('Milo Reyes');
  });

  it('treats unrecognised consent values as unknown', () => {
    const odd = buildRecordFile({
      ...baseInput,
      entities: syntheticEntities.map(entity =>
        entity.id === 'ent-milo'
          ? { ...entity, metadata: { featureConsent: 'maybe' } }
          : entity
      ),
    });
    expect(
      odd.people.find(person => person.name === 'Milo Reyes')?.featureConsent
    ).toBe('unknown');
  });
});
