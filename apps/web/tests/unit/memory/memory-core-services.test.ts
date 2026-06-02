import { describe, expect, it } from 'vitest';
import type { MemoryEntity } from '@/lib/db/schema/memory';
import {
  memoryAllDevIngestFixtures,
  memoryDevFixtures,
  memoryEnrichmentProviderFixtures,
  memoryFixtureScope,
} from '@/lib/memory/dev-fixtures';
import { MemoryEnrichmentRunner } from '@/lib/memory/enrichment-runner';
import { sanitizeSourceInput } from '@/lib/memory/evidence';
import { MemoryFixtureStore } from '@/lib/memory/fixture-store';
import { queryMemoryGraph } from '@/lib/memory/graph-query';
import { MemoryIdentityResolver } from '@/lib/memory/identity-resolver';
import { MemoryIngestHarness } from '@/lib/memory/ingest-harness';
import {
  MemoryCalendarLocationPhotoMatcher,
  MemoryCatalogVoiceMemoMatcher,
} from '@/lib/memory/matchers';
import { MemoryOpportunityGenerator } from '@/lib/memory/opportunity-generator';
import { MemoryReviewActions } from '@/lib/memory/review-actions';
import type { MemoryScope } from '@/lib/memory/types';

describe('Memory Core services', () => {
  it('ingests deterministic fixtures into evidence-backed memory rows', async () => {
    const store = new MemoryFixtureStore();
    const harness = new MemoryIngestHarness(store);

    const result = await harness.ingest(
      memoryFixtureScope,
      memoryAllDevIngestFixtures
    );

    expect(result.sourceRecords).toHaveLength(
      memoryAllDevIngestFixtures.length
    );
    expect(store.entities.map(entity => entity.primaryName)).toContain(
      'Steve Aoki'
    );
    expect(store.assets.some(asset => asset.kind === 'photo')).toBe(true);
    expect(store.events[0]?.creatorProfileId).toBe(
      memoryFixtureScope.creatorProfileId
    );
    expect(store.observations).not.toHaveLength(0);
    expect(
      store.observations.every(observation =>
        Boolean(observation.sourceRecordId)
      )
    ).toBe(true);
  });

  it('resolves identity by provider ID before creating duplicate entities', async () => {
    const store = new MemoryFixtureStore();
    const resolver = new MemoryIdentityResolver(store);
    const source = await store.upsertSourceRecord(memoryFixtureScope, {
      sourceType: 'dev_fixture',
      externalId: 'resolver:test',
      metadata: {},
    });
    const candidate = {
      type: 'artist' as const,
      name: 'Steve Aoki',
      identities: [
        {
          provider: 'musicbrainz',
          providerId: '0f1d4e89-7f2e-4d95-8f6d-steve-aoki',
        },
      ],
      evidence: [{ sourceRecordId: source.id }],
    };

    const first = await resolver.resolve(memoryFixtureScope, candidate);
    const second = await resolver.resolve(memoryFixtureScope, {
      ...candidate,
      name: 'Steven Hiroyuki Aoki',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entityId).toBe(first.entityId);
    expect(store.entities).toHaveLength(1);
  });

  it('runs enrichment from fixture provider responses and records sourced facts', async () => {
    const { store, steveAoki } = await seedBaseMemory();
    const runner = new MemoryEnrichmentRunner(store);

    const result = await runner.run(memoryFixtureScope, {
      entityId: steveAoki.id,
      responses: [
        memoryEnrichmentProviderFixtures.wikipedia,
        memoryEnrichmentProviderFixtures.wikidata,
      ],
    });
    const enriched = await store.getEntity(memoryFixtureScope, steveAoki.id);

    expect(result.jobIds).toHaveLength(2);
    expect(result.observationIds.length).toBeGreaterThan(1);
    expect(enriched?.metadata).toMatchObject({
      enrichment: { birthDate: '1977-11-30' },
    });
    expect(
      store.observations
        .filter(observation => observation.entityId === steveAoki.id)
        .every(observation => Boolean(observation.sourceRecordId))
    ).toBe(true);
  });

  it('generates pending review opportunities without auto-posting', async () => {
    const { store } = await seedBaseMemory();
    const generator = new MemoryOpportunityGenerator(store);

    const result = await generator.generate(memoryFixtureScope, {
      now: new Date('2026-06-02T12:00:00.000Z'),
    });

    expect(result.opportunityIds.length).toBeGreaterThan(0);
    const opportunity = store.opportunities.find(
      row => row.id === result.opportunityIds[0]
    );
    expect(opportunity?.status).toBe('pending');
    expect(opportunity?.metadata).toMatchObject({
      approvalRequired: true,
      kind: 'release_social_post',
    });
    expect(opportunity?.description).toContain('Post this and shout');
  });

  it('matches calendar locations against nearby photos with source evidence', async () => {
    const store = new MemoryFixtureStore();
    const harness = new MemoryIngestHarness(store);
    await harness.ingest(memoryFixtureScope, [
      memoryDevFixtures.photo,
      memoryDevFixtures.calendarEvent,
    ]);

    const matcher = new MemoryCalendarLocationPhotoMatcher(store);
    const result = await matcher.match(memoryFixtureScope);

    expect(result.observationCount).toBeGreaterThan(0);
    expect(
      store.observations.some(observation =>
        observation.fact.includes('Calendar event and photo')
      )
    ).toBe(true);
  });

  it('matches catalog songs to voice memos and proposes review content', async () => {
    const store = new MemoryFixtureStore();
    const harness = new MemoryIngestHarness(store);
    await harness.ingest(memoryFixtureScope, [
      memoryDevFixtures.catalogSong,
      memoryDevFixtures.release,
      memoryDevFixtures.voiceMemo,
    ]);

    const matcher = new MemoryCatalogVoiceMemoMatcher(store);
    const result = await matcher.match(memoryFixtureScope);

    expect(result.edgeCount).toBeGreaterThan(0);
    expect(result.opportunityIds).toHaveLength(1);
    expect(store.opportunities[0]?.status).toBe('pending');
    expect(store.opportunities[0]?.metadata).toMatchObject({
      approvalRequired: true,
      kind: 'voice_memo_release_content',
    });
  });

  it('queries graph snapshots within strict user and creator profile scope', async () => {
    const { store, steveAoki } = await seedBaseMemory();
    const otherScope: MemoryScope = {
      userId: memoryFixtureScope.userId,
      creatorProfileId: '00000000-0000-4000-8000-000000000099',
    };
    await new MemoryIngestHarness(store).ingest(otherScope, [
      memoryDevFixtures.chat,
    ]);

    const graph = await queryMemoryGraph(
      memoryFixtureScope,
      { entityId: steveAoki.id },
      store
    );

    expect(graph.entities.some(entity => entity.id === steveAoki.id)).toBe(
      true
    );
    expect(
      graph.entities.every(
        entity =>
          entity.creatorProfileId === memoryFixtureScope.creatorProfileId
      )
    ).toBe(true);
  });

  it('rejects cross-profile source evidence and observation review updates', async () => {
    const store = new MemoryFixtureStore();
    const resolver = new MemoryIdentityResolver(store);
    const actions = new MemoryReviewActions(store);
    const otherScope: MemoryScope = {
      userId: memoryFixtureScope.userId,
      creatorProfileId: '00000000-0000-4000-8000-000000000099',
    };
    const localSource = await store.upsertSourceRecord(memoryFixtureScope, {
      sourceType: 'dev_fixture',
      externalId: 'local-source',
      metadata: {},
    });
    const otherSource = await store.upsertSourceRecord(otherScope, {
      sourceType: 'dev_fixture',
      externalId: 'cross-profile-source',
      metadata: {},
    });
    const localEntity = await resolver.resolve(memoryFixtureScope, {
      type: 'artist',
      name: 'Local Artist',
      evidence: [{ sourceRecordId: localSource.id }],
    });
    const otherEntity = await resolver.resolve(otherScope, {
      type: 'artist',
      name: 'Other Artist',
      evidence: [{ sourceRecordId: otherSource.id }],
    });
    const observation = await store.createObservation(otherScope, {
      entityId: otherEntity.entityId,
      sourceRecordId: otherSource.id,
      fact: 'Other profile fact',
    });

    await expect(
      store.createObservation(memoryFixtureScope, {
        entityId: localEntity.entityId,
        sourceRecordId: otherSource.id,
        fact: 'Cross-profile fact',
      })
    ).rejects.toThrow(/Memory source not found/);
    await expect(
      actions.setObservationStatus(
        memoryFixtureScope,
        observation.id,
        'accepted'
      )
    ).rejects.toThrow(/Memory entity not found/);
  });

  it('updates review statuses without creating posting actions', async () => {
    const { store, steveAoki } = await seedBaseMemory();
    const generator = new MemoryOpportunityGenerator(store);
    await generator.generate(memoryFixtureScope, {
      now: new Date('2026-06-02T12:00:00.000Z'),
    });
    const actions = new MemoryReviewActions(store);
    const observation = store.observations.find(
      row => row.entityId === steveAoki.id
    );
    const opportunity = store.opportunities[0];

    const confirmed = await actions.setEntityStatus(
      memoryFixtureScope,
      steveAoki.id,
      'confirmed'
    );
    const accepted = await actions.setObservationStatus(
      memoryFixtureScope,
      observation?.id ?? '',
      'accepted'
    );
    const approved = await actions.setOpportunityStatus(
      memoryFixtureScope,
      opportunity?.id ?? '',
      'approved'
    );

    expect(confirmed.status).toBe('confirmed');
    expect(accepted.status).toBe('accepted');
    expect(approved.status).toBe('approved');
    expect(store.opportunities).toHaveLength(1);
  });

  it('does not copy raw email bodies into source metadata', () => {
    const sanitized = sanitizeSourceInput({
      sourceType: 'gmail_message',
      externalId: 'gmail:message-1',
      metadata: {
        subject: 'Studio plan',
        body: 'full raw email body',
        html: '<p>full raw email html</p>',
        nested: {
          plainText: 'nested raw email text',
          snippet: 'safe summary',
        },
      },
    });

    expect(sanitized.metadata).toEqual({
      subject: 'Studio plan',
      nested: { snippet: 'safe summary' },
    });
  });
});

async function seedBaseMemory(): Promise<{
  readonly store: MemoryFixtureStore;
  readonly steveAoki: MemoryEntity;
}> {
  const store = new MemoryFixtureStore();
  const harness = new MemoryIngestHarness(store);
  await harness.ingest(memoryFixtureScope, [
    memoryDevFixtures.chat,
    memoryDevFixtures.photo,
    memoryDevFixtures.catalogSong,
    memoryDevFixtures.release,
    memoryDevFixtures.voiceMemo,
  ]);
  const steveAoki = store.entities.find(
    entity => entity.primaryName === 'Steve Aoki'
  );
  if (!steveAoki) throw new Error('Fixture failed to create Steve Aoki');
  return { store, steveAoki };
}
