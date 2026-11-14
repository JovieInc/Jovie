import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { MemoryFixtureStore } from '@/lib/memory/fixture-store';
import type { MemoryScope } from '@/lib/memory/types';
import { type ListRecordFileSources, loadRecordFile } from './load.server';

const scope: MemoryScope = {
  userId: 'user-synthetic',
  creatorProfileId: 'profile-synthetic',
};
const asOf = new Date('2026-11-01T00:00:00.000Z');

async function seed() {
  const store = new MemoryFixtureStore();
  const record = await store.createEntity(scope, {
    type: 'release',
    name: 'Night Signal',
    metadata: { releaseDate: '2015-06-12' },
  });
  const mixer = await store.createEntity(scope, {
    type: 'person',
    name: 'Cass Ortega',
    metadata: { featureConsent: 'ok' },
  });
  await store.createEdge(scope, {
    fromEntityId: mixer.id,
    toEntityId: record.id,
    relation: 'mixer',
  });
  const mix = await store.upsertSourceRecord(scope, {
    sourceType: 'gmail_message',
    externalId: 'gmail:mix',
    metadata: {
      subject: 'Night Signal mix v3',
      from: { name: 'Cass Ortega', domain: 'cassmix.example' },
      date: '2015-03-10T17:30:00.000Z',
    },
  });
  const rejected = await store.upsertSourceRecord(scope, {
    sourceType: 'gmail_message',
    externalId: 'gmail:rejected',
    metadata: { subject: 'Remix Agreement - Night Signal' },
  });
  await store.createObservation(scope, {
    entityId: record.id,
    sourceRecordId: mix.id,
    fact: 'mix thread',
  });
  await store.createObservation(scope, {
    entityId: record.id,
    sourceRecordId: rejected.id,
    fact: 'not this record',
    status: 'rejected',
  });
  const listSources: ListRecordFileSources = async (_scope, sourceIds) =>
    store.sourceRecords.filter(source => sourceIds.includes(source.id));
  return { store, record, mixer, mix, listSources };
}

describe('loadRecordFile', () => {
  it('builds the record file from the record entity graph and its sources', async () => {
    const { store, record, mix, listSources } = await seed();
    const file = await loadRecordFile(scope, record.id, {
      asOf,
      store,
      listSources,
    });

    expect(file?.record.title).toBe('Night Signal');
    expect(file?.timeline.map(entry => entry.sourceRecordId)).toEqual([mix.id]);
    expect(file?.tagsByKind.mix.map(ref => ref.sourceRecordId)).toEqual([
      mix.id,
    ]);
    expect(file?.tagsByKind.contract).toEqual([]);
    expect(file?.content.nameable.map(person => person.name)).toEqual([
      'Cass Ortega',
    ]);
  });

  it('returns null for missing or non-record entities', async () => {
    const { store, mixer, listSources } = await seed();
    await expect(
      loadRecordFile(scope, mixer.id, { asOf, store, listSources })
    ).resolves.toBeNull();
    await expect(
      loadRecordFile(scope, 'missing', { asOf, store, listSources })
    ).resolves.toBeNull();
  });
});
