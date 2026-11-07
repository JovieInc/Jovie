import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_SPEC,
  liveRow,
  MARKETING_PAGE_KIND,
  resetStoreState,
  state,
  validSpec,
} from './fixtures/content-store.fixture';
import * as store from './store.server';

describe('content record store', () => {
  beforeEach(resetStoreState);
  it('serves the code default before the migration lands', async () => {
    state.tableExists = false;
    const live = await store.getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(live).toMatchObject({ source: 'default', versionId: null });
    expect(live.data).toBe(DEFAULT_HOME_SPEC);
  });

  it('serves the code default when the store errors or nothing is live', async () => {
    state.readThrows = true;
    expect(
      (await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).source
    ).toBe('default');
    state.readThrows = false;
    state.selectResults = [[]];
    expect(
      (await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).source
    ).toBe('default');
  });

  it('serves the published version, but not one that no longer validates', async () => {
    const publishedAt = new Date('2026-10-28T01:00:00Z');
    state.selectResults = [
      [
        {
          versionId: 'v2',
          version: 2,
          schemaVersion: 1,
          data: validSpec(),
          publishedAt,
        },
      ],
    ];
    expect(await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).toEqual({
      data: validSpec(),
      source: 'live',
      versionId: 'v2',
      version: 2,
      publishedAt: publishedAt.toISOString(),
    });

    state.selectResults = [
      [{ versionId: 'v3', version: 3, data: { sections: [] }, publishedAt }],
    ];
    expect(
      (await store.getLiveContent(MARKETING_PAGE_KIND, 'home')).source
    ).toBe('default');
  });

  it('refuses to store an invalid draft', async () => {
    await expect(
      store.createContentVersion(MARKETING_PAGE_KIND, {
        key: 'home',
        data: DEFAULT_HOME_SPEC,
        author: 'agent:summer',
      })
    ).rejects.toBeInstanceOf(store.ContentValidationError);
    expect(state.inserts).toEqual([]);
  });

  it('numbers drafts after the latest version', async () => {
    state.selectResults = [[{ latest: 4 }]];
    const version = await store.createContentVersion(MARKETING_PAGE_KIND, {
      key: 'home',
      data: validSpec(),
      author: 'agent:summer',
      note: 'n',
    });
    expect(version.version).toBe(5);
    expect(state.atomicCalls).toEqual([
      expect.objectContaining({ actorId: 'agent:summer' }),
    ]);
  });

  it('labels old-schema live data as a default fallback rather than serving it as the approved version', async () => {
    state.selectResults = [[liveRow()]];
    await expect(
      store.getLiveContent({ ...MARKETING_PAGE_KIND, schemaVersion: 2 }, 'home')
    ).resolves.toMatchObject({
      source: 'default',
      versionId: null,
      fallbackReason: 'incompatible',
    });
  });
});
