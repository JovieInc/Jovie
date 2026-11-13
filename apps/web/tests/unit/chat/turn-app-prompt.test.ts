import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssembleAppPromptInput } from '@/lib/chat/turn-app-prompt';

const selectMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: () => 'missing',
}));

const artistContext = {
  displayName: 'The Artist',
  username: 'theartist',
  bio: 'Independent alt-pop artist',
  genres: ['alt-pop'],
  spotifyFollowers: 12345,
  spotifyPopularity: 57,
  profileViews: 876,
  hasSocialLinks: true,
  hasMusicLinks: true,
  spotifyUrl: null,
  tippingStats: {
    tipClicks: 10,
    tipsSubmitted: 2,
    totalReceivedCents: 1200,
    monthReceivedCents: 500,
  },
};

const releaseRow = {
  id: 'release-1',
  title: 'Midnight',
  releaseType: 'single',
  releaseDate: new Date('2026-01-01T00:00:00.000Z'),
  artworkUrl: null,
  spotifyPopularity: 12,
  totalTracks: 1,
  upc: null,
  label: null,
  distributor: null,
  metadata: {},
};

function makeChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

const baseInput = {
  artistContext,
  releases: [
    {
      id: releaseRow.id,
      title: releaseRow.title,
      releaseType: releaseRow.releaseType,
      releaseDate: '2026-01-01T00:00:00.000Z',
      artworkUrl: null,
      spotifyPopularity: releaseRow.spotifyPopularity,
      totalTracks: releaseRow.totalTracks,
      canvasStatus: 'not_set',
      metadata: {},
    },
  ],
  profileId: 'profile-1',
  userTexts: ['What should I do next?'],
  aiCanUseTools: true,
  aiWeeklyMessageLimit: 10,
  insightsEnabled: false,
  knowledgeContext: '',
} satisfies AssembleAppPromptInput;

describe('assembleAppModeSystemPrompt catalog threading', () => {
  beforeEach(() => {
    selectMock.mockReset();
    selectMock.mockImplementation(() => makeChain([]));
  });

  it('threads an unavailable catalog into the prompt as unreadable, never as zero', async () => {
    const { assembleAppModeSystemPrompt } = await import(
      '@/lib/chat/turn-app-prompt'
    );

    const parts = await assembleAppModeSystemPrompt({
      ...baseInput,
      releases: [],
      releaseCatalog: { status: 'unavailable', total: null },
    });

    expect(parts.stable).toContain(
      '- **Total Releases:** unknown (catalog temporarily unavailable)'
    );
    expect(parts.stable).toContain(
      'The release catalog could not be read this turn.'
    );
    expect(parts.stable).not.toContain(
      'No releases found in the connected discography yet.'
    );
    expect(parts.stable).not.toContain('- **Total Releases:** 0');
  });

  it('defaults to the loaded-slice total when no catalog meta is supplied', async () => {
    const { assembleAppModeSystemPrompt } = await import(
      '@/lib/chat/turn-app-prompt'
    );

    const parts = await assembleAppModeSystemPrompt(baseInput);

    expect(parts.stable).toContain('- **Total Releases:** 1');
    expect(parts.stable).toContain('- Midnight (single, 1 track;');
  });

  it('hydrates a beyond-slice @release token through the owned query', async () => {
    const owned = {
      ...releaseRow,
      id: '11111111-2222-3333-4444-555555555555',
      title: 'Never Say A Word',
      releaseDate: '2024-02-02T00:00:00.000Z',
    };
    // First query: the owned release row; second: its provider links (empty).
    const chains: ReturnType<typeof makeChain>[] = [];
    selectMock.mockReset();
    selectMock.mockImplementation(() => {
      const chain = makeChain(chains.length === 0 ? [owned] : []);
      chains.push(chain);
      return chain;
    });

    const { assembleAppModeSystemPrompt } = await import(
      '@/lib/chat/turn-app-prompt'
    );

    const parts = await assembleAppModeSystemPrompt({
      ...baseInput,
      userTexts: [
        'Promote @release:11111111-2222-3333-4444-555555555555[Never Say A Word]',
      ],
    });

    // The referenced-entities block is per-turn (dynamic), never stable.
    expect(parts.stable).not.toContain('Never Say A Word');
    expect(parts.dynamic).toContain(
      'release:11111111-2222-3333-4444-555555555555'
    );
    expect(parts.dynamic).toContain('Never Say A Word');
    expect(parts.dynamic).toContain("in THIS artist's own catalog");
  });

  it('renders a beyond-slice token as unsupported when the owned lookup misses', async () => {
    selectMock.mockImplementation(() => makeChain([]));

    const { assembleAppModeSystemPrompt } = await import(
      '@/lib/chat/turn-app-prompt'
    );

    const parts = await assembleAppModeSystemPrompt({
      ...baseInput,
      userTexts: [
        'Promote @release:99999999-2222-3333-4444-555555555555[Some Other Release]',
      ],
    });

    expect(parts.dynamic).not.toContain("in THIS artist's own catalog");
  });

  it('hydrates an @profile token for the signed-in artist', async () => {
    const { assembleAppModeSystemPrompt } = await import(
      '@/lib/chat/turn-app-prompt'
    );

    const parts = await assembleAppModeSystemPrompt({
      ...baseInput,
      userTexts: ['Look at @profile:profile-1[The Artist]'],
    });

    expect(parts.dynamic).toContain(
      'profile:profile-1 "The Artist" (@theartist) — the user\'s own Jovie profile. The artist facts above describe it.'
    );
  });
});
