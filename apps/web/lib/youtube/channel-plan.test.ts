import { describe, expect, it } from 'vitest';
import {
  buildChannelPlan,
  type ChannelPlanInput,
  hasJovieLink,
  matchRelease,
} from './channel-plan';

const NOW = new Date('2026-11-01T12:00:00Z');
const releases = [
  { title: 'Glass Hours', slug: 'glass-hours', releaseDate: '2020-05-01' },
  { title: 'Northbound', slug: 'northbound', releaseDate: '2020-09-01' },
  { title: 'Hours', slug: 'hours', releaseDate: '2019-01-01' },
  { title: 'Weightless', slug: 'weightless', releaseDate: '2019-06-01' },
];

function input(overrides: Partial<ChannelPlanInput> = {}): ChannelPlanInput {
  return {
    channelUrl: 'https://www.youtube.com/@cassarden',
    artistName: 'Cass Arden',
    profileUrl: 'https://jov.ie/cassarden',
    releases,
    connected: false,
    connectUrl: 'https://app.jov.ie/api/connectors/youtube/authorize?x=1',
    channel: {
      title: 'Cass Arden',
      subscriberCount: 24_100,
      videoCount: 61,
      description: 'Official channel.',
      playlistCount: 0,
      lastUploadAt: '2026-03-01T00:00:00Z',
    },
    topVideos: [
      {
        videoId: 'a',
        title: 'Cass Arden - Glass Hours (Official Video)',
        viewCount: 8_400_000,
        description: 'Spotify: https://open.spotify.com/x',
        publishedAt: '2020-05-01T00:00:00Z',
      },
      {
        videoId: 'b',
        title: 'Northbound [Lyric Video]',
        viewCount: 2_600_000,
        description: 'Everywhere: https://jov.ie/cassarden/northbound',
        publishedAt: '2020-09-01T00:00:00Z',
      },
    ],
    now: NOW,
    ...overrides,
  };
}

describe('matchRelease', () => {
  it('prefers the longest whole-word title match', () => {
    expect(matchRelease('Glass Hours (Official Video)', releases)?.slug).toBe(
      'glass-hours'
    );
    expect(matchRelease('Unrelated live set', releases)).toBeNull();
  });
});

describe('hasJovieLink', () => {
  it('detects jov.ie links only', () => {
    expect(hasJovieLink('go https://jov.ie/a/b')).toBe(true);
    expect(hasJovieLink('https://open.spotify.com/x')).toBe(false);
  });
});

describe('buildChannelPlan', () => {
  it('ranks description links first with the real song links and views', () => {
    const plan = buildChannelPlan(input());
    expect(plan.dataSource).toBe('youtube_data_api');
    expect(plan.channelHandle).toBe('@cassarden');
    expect(plan.moves[0]?.id).toBe('description_links');
    expect(plan.moves[0]?.title).toContain('1 most-viewed video');
    expect(plan.moves[0]?.examples[0]).toBe(
      'Cass Arden - Glass Hours (Official Video) (8.4M views) -> https://jov.ie/cassarden/glass-hours'
    );
    expect(plan.moves.map(m => m.rank)).toEqual(
      plan.moves.map((_, i) => i + 1)
    );
    expect(plan.moves.length).toBeGreaterThanOrEqual(3);
    expect(plan.moves.length).toBeLessThanOrEqual(5);
  });

  it('flags a stale channel and offers the connect step when not connected', () => {
    const plan = buildChannelPlan(input());
    expect(plan.moves.some(m => m.id === 'shorts_from_legacy')).toBe(true);
    expect(plan.connect.url).toContain('/api/connectors/youtube/authorize');
    expect(plan.connect.unlocks.length).toBeGreaterThan(0);
  });

  it('drops the connect link once connected', () => {
    const plan = buildChannelPlan(input({ connected: true }));
    expect(plan.connect).toEqual({ connected: true, url: null, unlocks: [] });
  });

  it('still returns a catalog plan with no public data', () => {
    const plan = buildChannelPlan(input({ channel: null, topVideos: [] }));
    expect(plan.dataSource).toBe('profile_and_catalog');
    expect(plan.moves[0]?.id).toBe('description_links');
    expect(plan.moves[0]?.examples[0]).toBe(
      'Northbound -> https://jov.ie/cassarden/northbound'
    );
    expect(plan.moves.some(m => m.id === 'shorts_from_legacy')).toBe(false);
    expect(plan.moves.length).toBeGreaterThanOrEqual(3);
  });

  it('skips era playlists when the channel already has enough', () => {
    const plan = buildChannelPlan(
      input({
        channel: { ...input().channel!, playlistCount: 10 },
      })
    );
    expect(plan.moves.some(m => m.id === 'era_playlists')).toBe(false);
  });
});
