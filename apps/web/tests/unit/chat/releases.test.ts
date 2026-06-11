import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: () => 'missing',
}));

describe('fetchReleasesForChat', () => {
  beforeEach(() => {
    selectMock.mockReset();
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: 'release-1',
          title: 'Midnight',
          releaseType: 'single',
          releaseDate: new Date('2026-01-01T00:00:00.000Z'),
          artworkUrl: null,
          spotifyPopularity: 12,
          totalTracks: 1,
          metadata: {},
        },
      ]),
    };
    selectMock.mockReturnValue(chain);
  });

  it('issues one release query per fetch call', async () => {
    const { fetchReleasesForChat } = await import('@/lib/chat/releases');

    const releases = await fetchReleasesForChat('profile-1');

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(releases).toEqual([
      expect.objectContaining({
        id: 'release-1',
        title: 'Midnight',
        canvasStatus: 'missing',
      }),
    ]);
  });
});

describe('chat route release-query wiring', () => {
  it('does not call fetchReleasesForChat inside tool executors', async () => {
    const routePath = path.join(process.cwd(), 'app/api/chat/route.ts');
    const source = await readFile(routePath, 'utf8');
    const matches = source.match(/fetchReleasesForChat/g) ?? [];

    expect(matches).toHaveLength(2);
    expect(source).toContain(
      "import { fetchReleasesForChat } from '@/lib/chat/releases'"
    );
    expect(source).toContain('return await fetchReleasesForChat(profileId);');
    expect(source).not.toContain(
      'await fetchReleasesForChat(params.profileId)'
    );
    expect(source).not.toContain(
      'await fetchReleasesForChat(resolvedProfileId)'
    );
  });
});
