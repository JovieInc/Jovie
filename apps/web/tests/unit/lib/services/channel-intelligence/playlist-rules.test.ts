import { describe, expect, it } from 'vitest';
import { gateChannelPlaylists } from '@/lib/services/channel-intelligence/playlist-rules';

describe('gateChannelPlaylists copied fields', () => {
  it('trims playlist name and url and omits blank ones', () => {
    const gated = gateChannelPlaylists({
      nowIso: '2026-08-20T00:00:00.000Z',
      fetched: [
        {
          id: 'pl_blank',
          name: '   ',
          url: '   ',
          lastActivityAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'pl_named',
          name: '  Late Night  ',
          url: '  https://open.spotify.com/playlist/pl_named  ',
          lastActivityAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });

    const blank = gated.recommendations.find(row => row.id === 'pl_blank');
    const named = gated.recommendations.find(row => row.id === 'pl_named');
    expect(blank).toBeDefined();
    expect(blank).not.toHaveProperty('name');
    expect(blank).not.toHaveProperty('url');
    expect(named).toMatchObject({
      name: 'Late Night',
      url: 'https://open.spotify.com/playlist/pl_named',
    });
  });
});
