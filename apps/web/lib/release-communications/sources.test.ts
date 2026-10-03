import { describe, expect, it } from 'vitest';
import {
  InMemoryReleaseCommunicationsAdapter,
  type VerifiedMergeEvent,
} from './index';
import {
  SOURCE_REPOSITORY_ADAPTERS,
  sourceAdapterForRepository,
} from './sources';

const mergePayload = (overrides: Record<string, unknown> = {}) => ({
  pullRequestNumber: 200,
  mergeSha: 'deadbeef',
  mergedAt: '2026-10-02T12:00:00Z',
  title: 'Ship it',
  verified: true,
  ...overrides,
});

describe('source repository adapters', () => {
  it('inventories every active product repository', () => {
    expect(
      SOURCE_REPOSITORY_ADAPTERS.map(adapter => adapter.repository)
    ).toEqual(['JovieInc/Jovie', 'JovieInc/LogYourBody', 'JovieInc/ovie']);
  });

  it.each(SOURCE_REPOSITORY_ADAPTERS)(
    '$repository emits a verified event with product provenance',
    adapter => {
      const event = adapter.toVerifiedMergeEvent(
        mergePayload({ repository: adapter.repository })
      );
      expect(event).toMatchObject({
        repository: adapter.repository,
        product: adapter.product,
        verified: true,
      });
    }
  );

  it('rejects payloads claiming a different repository', () => {
    const adapter = sourceAdapterForRepository('JovieInc/ovie');
    expect(
      adapter?.toVerifiedMergeEvent(
        mergePayload({ repository: 'JovieInc/Jovie' })
      )
    ).toBeNull();
  });

  it('rejects unverified payloads and unknown repositories', () => {
    const adapter = sourceAdapterForRepository('JovieInc/LogYourBody');
    expect(
      adapter?.toVerifiedMergeEvent(
        mergePayload({
          repository: 'JovieInc/LogYourBody',
          verified: false,
        })
      )
    ).toBeNull();
    expect(sourceAdapterForRepository('JovieInc/unknown')).toBeNull();
  });

  it('keeps declared app provenance and applies the default otherwise', () => {
    const jovie = sourceAdapterForRepository('JovieInc/Jovie');
    expect(
      jovie?.toVerifiedMergeEvent(
        mergePayload({ repository: 'JovieInc/Jovie', app: 'ios' })
      )?.app
    ).toBe('ios');
    const ovie = sourceAdapterForRepository('JovieInc/ovie');
    expect(
      ovie?.toVerifiedMergeEvent(mergePayload({ repository: 'JovieInc/ovie' }))
        ?.app
    ).toBe('web');
  });
});

describe('adapter replay into the canonical contract', () => {
  it.each(SOURCE_REPOSITORY_ADAPTERS)(
    '$repository merge event replay is idempotent',
    async adapter => {
      const store = new InMemoryReleaseCommunicationsAdapter();
      const payload = mergePayload({ repository: adapter.repository });
      const event = adapter.toVerifiedMergeEvent(payload) as VerifiedMergeEvent;
      const first = await store.ingest(event);
      const replayed = await store.ingest(
        adapter.toVerifiedMergeEvent(payload) as VerifiedMergeEvent
      );
      expect(replayed.id).toBe(first.id);
      expect(replayed.entries).toHaveLength(1);
    }
  );

  it('does not conflate same-number merges across repositories', async () => {
    const store = new InMemoryReleaseCommunicationsAdapter();
    const jovie = sourceAdapterForRepository('JovieInc/Jovie');
    const lyb = sourceAdapterForRepository('JovieInc/LogYourBody');
    await store.ingest(
      jovie?.toVerifiedMergeEvent(
        mergePayload({ repository: 'JovieInc/Jovie' })
      ) as VerifiedMergeEvent
    );
    const lybPost = await store.ingest(
      lyb?.toVerifiedMergeEvent(
        mergePayload({ repository: 'JovieInc/LogYourBody' })
      ) as VerifiedMergeEvent
    );
    expect(lybPost.product).toBe('logyourbody');
    const changelog = await store.listChangelog({});
    expect(changelog.map(post => post.entries.length)).toEqual([1, 1]);
  });
});

describe('consolidated changelog filters', () => {
  async function seeded() {
    const store = new InMemoryReleaseCommunicationsAdapter();
    const emit = async (repo: string, pr: number, app?: string) => {
      const event = sourceAdapterForRepository(repo)?.toVerifiedMergeEvent(
        mergePayload({
          repository: repo,
          pullRequestNumber: pr,
          mergeSha: `sha-${pr}`,
          ...(app ? { app } : {}),
        })
      );
      return store.ingest(event as VerifiedMergeEvent);
    };
    await emit('JovieInc/Jovie', 1);
    await emit('JovieInc/Jovie', 2, 'ios');
    await emit('JovieInc/LogYourBody', 1);
    await emit('JovieInc/ovie', 1);
    return store;
  }

  it('filters the consolidated changelog by source repository', async () => {
    const store = await seeded();
    const lyb = await store.listChangelog({
      repository: 'JovieInc/LogYourBody',
    });
    expect(lyb).toHaveLength(1);
    expect(lyb[0].product).toBe('logyourbody');
    expect(lyb[0].entries.map(e => e.repository)).toEqual([
      'JovieInc/LogYourBody',
    ]);
  });

  it('filters by source app and scopes entries', async () => {
    const store = await seeded();
    const ios = await store.listChangelog({ app: 'ios' });
    expect(ios).toHaveLength(1);
    expect(ios[0].entries).toHaveLength(1);
    expect(ios[0].entries[0].app).toBe('ios');
    const web = await store.listChangelog({ repository: 'JovieInc/Jovie' });
    // web + ios posts both belong to JovieInc/Jovie provenance.
    expect(web).toHaveLength(2);
    expect(
      web.flatMap(post => post.entries.map(entry => entry.repository))
    ).toEqual(['JovieInc/Jovie', 'JovieInc/Jovie']);
  });
});
