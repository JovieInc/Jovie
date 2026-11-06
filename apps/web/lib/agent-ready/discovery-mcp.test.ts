import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({
  spotifyGet: vi.fn(),
  spotifySearch: vi.fn(),
  appleGet: vi.fn(),
  appleSearch: vi.fn(),
}));

vi.mock('@/lib/spotify/client', () => ({
  spotifyClient: {
    getArtist: reads.spotifyGet,
    searchArtists: reads.spotifySearch,
  },
}));
vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  getArtist: reads.appleGet,
  searchArtist: reads.appleSearch,
  extractBio: () => null,
  extractImageUrls: () => null,
}));
vi.mock('@/lib/spotify/blacklist', () => ({
  isBlacklistedSpotifyId: () => false,
}));
vi.mock('@/lib/music-resolver/resolve-parity.server', () => ({
  scheduleResolveParity: () => false,
}));
vi.mock('@/lib/rate-limit', () => ({
  musicBrainzLookupLimiter: { limit: vi.fn() },
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: vi.fn() }));

import { BASE_URL } from '@/constants/app';
import { createMusicMcpServer } from '@/lib/agent-acquisition/music-mcp';
import { AGENT_SKILLS, buildMcpServerCard } from './discovery';

describe('agent discovery matches the real music MCP contract', () => {
  it('advertises the actual SDK tools and artist-only fetching without provider reads for track or album IDs', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createMusicMcpServer();
    const client = new Client({ name: 'discovery-contract', version: '1.0.0' });
    await server.connect(serverTransport);

    try {
      await client.connect(clientTransport);
      const tools = await client.listTools();
      const card = buildMcpServerCard(BASE_URL);
      expect(card.serverInfo).toMatchObject(client.getServerVersion()!);
      expect(card.tools.map(tool => tool.name).sort()).toEqual(
        tools.tools.map(tool => tool.name).sort()
      );

      const skill = AGENT_SKILLS.find(
        item => item.name === 'jovie-music-identity'
      )!;
      expect(skill.description).toContain('fetch public artists');
      expect(skill.description).toContain('resolve artist, track and album');
      expect(skill.body).toContain(`description: ${skill.description}\n`);

      const catalogId = '4Z8W4fKeB5YxbusRsdQVPb';
      for (const id of [
        `https://open.spotify.com/track/${catalogId}`,
        `https://open.spotify.com/album/${catalogId}`,
        'https://music.apple.com/us/album/123456',
      ]) {
        // Inspect the real protocol error envelope; callTool validates
        // structuredContent against the tool's success-only output schema.
        const result = await client.request(
          {
            method: 'tools/call',
            params: { name: 'fetch', arguments: { id } },
          },
          CallToolResultSchema
        );
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toEqual({
          error: { code: 'INVALID_INPUT', retryable: false },
        });
      }
      for (const read of Object.values(reads)) {
        expect(read).not.toHaveBeenCalled();
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
