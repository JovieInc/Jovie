import { describe, expect, it, vi } from 'vitest';
import {
  runSilentYouTubeLink,
  type SilentLinkDeps,
} from '@/lib/onboarding/youtube-silent-link-core';

const NOW = new Date('2026-10-25T01:00:00Z');
const catalog = ['Midnight Drive', 'Paper Hearts', 'Slow Burn'];

function deps(overrides: Partial<SilentLinkDeps> = {}): SilentLinkDeps {
  return {
    now: () => NOW,
    loadProfile: async () => ({
      displayName: 'Lena Hart',
      usernameNormalized: 'lenahart',
      settings: {},
    }),
    hasYouTubeLinkRow: async () => false,
    loadCatalogTitles: async () => catalog,
    searchChannels: async () => [
      { channelId: 'UCown', title: 'Lena Hart' },
      { channelId: 'UCfake', title: 'Lena Hart' },
    ],
    loadEvidence: async id =>
      id === 'UCown'
        ? {
            channelId: id,
            title: 'Lena Hart',
            handle: 'lenahart',
            videoTitles: ['Midnight Drive (Official Video)', 'Paper Hearts'],
          }
        : {
            channelId: id,
            title: 'Lena Hart',
            handle: null,
            videoTitles: ['my cat', 'vlog 3'],
          },
    insertLink: vi.fn(async () => {}),
    markChecked: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runSilentYouTubeLink', () => {
  it('links the one channel that carries the catalog, with no user input', async () => {
    const d = deps();
    const result = await runSilentYouTubeLink(d, 'p1');
    expect(result).toEqual({ status: 'linked', channelId: 'UCown' });
    expect(d.insertLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.youtube.com/@lenahart' })
    );
    expect(d.markChecked).toHaveBeenCalledWith('p1', NOW);
  });

  it('NEGATIVE: same-name channels with no catalog overlap link nothing', async () => {
    const d = deps({
      loadEvidence: async id => ({
        channelId: id,
        title: 'Lena Hart',
        handle: null,
        videoTitles: ['unrelated'],
      }),
    });
    expect(await runSilentYouTubeLink(d, 'p1')).toEqual({ status: 'no_match' });
    expect(d.insertLink).not.toHaveBeenCalled();
  });

  it('NEGATIVE: two proven own channels are ambiguous and link nothing', async () => {
    const d = deps({
      loadEvidence: async id => ({
        channelId: id,
        title: 'Lena Hart',
        handle: null,
        videoTitles: ['Midnight Drive', 'Paper Hearts'],
      }),
    });
    expect(await runSilentYouTubeLink(d, 'p1')).toEqual({ status: 'no_match' });
    expect(d.insertLink).not.toHaveBeenCalled();
  });

  it('respects an existing or owner-rejected youtube link row', async () => {
    const d = deps({ hasYouTubeLinkRow: async () => true });
    expect(await runSilentYouTubeLink(d, 'p1')).toEqual({
      status: 'skipped',
      reason: 'already_linked',
    });
    expect(d.insertLink).not.toHaveBeenCalled();
  });

  it('throttles repeat checks within 24h without calling the provider', async () => {
    const search = vi.fn(async () => []);
    const d = deps({
      searchChannels: search,
      loadProfile: async () => ({
        displayName: 'Lena Hart',
        usernameNormalized: 'lenahart',
        settings: {
          onboarding: { youtubeDiscoveryAt: '2026-10-25T00:00:00.000Z' },
        },
      }),
    });
    expect(await runSilentYouTubeLink(d, 'p1')).toEqual({
      status: 'skipped',
      reason: 'recently_checked',
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('waits for a catalog instead of guessing from a name', async () => {
    const search = vi.fn(async () => []);
    const d = deps({
      loadCatalogTitles: async () => ['One'],
      searchChannels: search,
    });
    expect(await runSilentYouTubeLink(d, 'p1')).toEqual({
      status: 'skipped',
      reason: 'catalog_too_small',
    });
    expect(search).not.toHaveBeenCalled();
    expect(d.markChecked).not.toHaveBeenCalled();
  });

  it('fails soft when the provider key is missing', async () => {
    const d = deps({
      searchChannels: async () => {
        throw Object.assign(new Error('x'), {
          code: 'youtube_data_api_unavailable',
        });
      },
    });
    expect(await runSilentYouTubeLink(d, 'p1')).toEqual({
      status: 'skipped',
      reason: 'provider_unavailable',
    });
    expect(d.insertLink).not.toHaveBeenCalled();
  });
});
