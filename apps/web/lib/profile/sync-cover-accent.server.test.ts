import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectLimit = vi.fn();
const updateWhere = vi.fn();
const buildThemeWithProfileAccent = vi.fn();
const readProfileAccentTheme = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: selectLimit,
          })),
          limit: selectLimit,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: updateWhere,
      })),
    })),
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    artworkUrl: 'artworkUrl',
    creatorProfileId: 'creatorProfileId',
    releaseDate: 'releaseDate',
    id: 'id',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    theme: 'theme',
  },
}));

vi.mock('@/lib/profile/public-release-eligibility', () => ({
  publicReleaseEligibilitySqlPredicate: () => true,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

vi.mock('./profile-theme.server', () => ({
  buildThemeWithProfileAccent,
}));

vi.mock('./profile-theme', () => ({
  readProfileAccentTheme,
}));

describe('syncProfileCoverAccentTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit.mockReset();
    updateWhere.mockReset();
    buildThemeWithProfileAccent.mockReset();
    readProfileAccentTheme.mockReset();
  });

  it('no-ops when the newest public release has no artwork', async () => {
    selectLimit.mockResolvedValueOnce([]);
    const { syncProfileCoverAccentTheme } = await import(
      './sync-cover-accent.server'
    );

    await expect(syncProfileCoverAccentTheme('profile-1')).resolves.toEqual({
      updated: false,
      sourceUrl: null,
    });
    expect(buildThemeWithProfileAccent).not.toHaveBeenCalled();
  });

  it('skips the write when theme already points at the newest cover', async () => {
    selectLimit
      .mockResolvedValueOnce([{ artworkUrl: 'https://cdn.example/cover.jpg' }])
      .mockResolvedValueOnce([{ theme: { mode: 'dark' } }]);
    readProfileAccentTheme.mockReturnValue({
      version: 1,
      primaryHex: '#11afff',
      sourceUrl: 'https://cdn.example/cover.jpg',
    });

    const { syncProfileCoverAccentTheme } = await import(
      './sync-cover-accent.server'
    );

    await expect(syncProfileCoverAccentTheme('profile-1')).resolves.toEqual({
      updated: false,
      sourceUrl: 'https://cdn.example/cover.jpg',
    });
    expect(buildThemeWithProfileAccent).not.toHaveBeenCalled();
  });

  it('writes a cover-derived accent when the newest artwork changes', async () => {
    selectLimit
      .mockResolvedValueOnce([
        { artworkUrl: 'https://cdn.example/new-cover.jpg' },
      ])
      .mockResolvedValueOnce([{ theme: { mode: 'dark' } }]);
    readProfileAccentTheme.mockReturnValue({
      version: 1,
      primaryHex: '#aa7744',
      sourceUrl: 'https://cdn.example/old-cover.jpg',
    });
    buildThemeWithProfileAccent.mockResolvedValue({
      mode: 'dark',
      profileAccent: {
        version: 1,
        primaryHex: '#cf824c',
        sourceUrl: 'https://cdn.example/new-cover.jpg',
      },
    });
    updateWhere.mockResolvedValue(undefined);

    const { syncProfileCoverAccentTheme } = await import(
      './sync-cover-accent.server'
    );

    await expect(syncProfileCoverAccentTheme('profile-1')).resolves.toEqual({
      updated: true,
      sourceUrl: 'https://cdn.example/new-cover.jpg',
    });
    expect(buildThemeWithProfileAccent).toHaveBeenCalledWith({
      existingTheme: { mode: 'dark' },
      sourceUrl: 'https://cdn.example/new-cover.jpg',
    });
    expect(updateWhere).toHaveBeenCalled();
  });
});
