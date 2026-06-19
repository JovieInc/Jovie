import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedDesignPartnerConfig } from './types';

const {
  mockCreateReleaseToRevenueRun,
  mockResolveDesignPartnerConfig,
  mockResolveReleaseMetadataFromCatalog,
} = vi.hoisted(() => ({
  mockCreateReleaseToRevenueRun: vi.fn(),
  mockResolveDesignPartnerConfig: vi.fn(),
  mockResolveReleaseMetadataFromCatalog: vi.fn(),
}));

vi.mock('./design-partner-config', () => ({
  resolveDesignPartnerConfig: mockResolveDesignPartnerConfig,
  isDesignPartnerUser: (userId: string, config: ResolvedDesignPartnerConfig) =>
    config.userId === userId,
}));

vi.mock('./create-run', () => ({
  createReleaseToRevenueRun: mockCreateReleaseToRevenueRun,
}));

vi.mock('./release-metadata', () => ({
  resolveReleaseMetadataFromCatalog: mockResolveReleaseMetadataFromCatalog,
  resolveReleaseMetadataFromManual: vi.fn((input, username: string) => ({
    title: input.title.trim(),
    artworkUrl: input.artworkUrl ?? null,
    links: input.links ?? [],
    smartLinkPath: input.slug ? `/${username}/${input.slug}` : undefined,
    slug: input.slug,
  })),
}));

import { triggerNewRelease } from './trigger-new-release';

const designPartner: ResolvedDesignPartnerConfig = {
  creatorUsername: 'timwhite',
  creatorProfileId: 'profile-1',
  userId: 'user-1',
  store: { provider: 'printful', scope: 'default' },
  socialAccount: { platform: 'instagram', handle: 'timwhite' },
  smsListId: 'design-partner-sms-fans',
};

describe('triggerNewRelease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveDesignPartnerConfig.mockResolvedValue(designPartner);
    mockCreateReleaseToRevenueRun.mockResolvedValue({
      runId: 'run-1',
      status: 'created',
    });
  });

  it('returns feature-disabled when flag is off', async () => {
    const result = await triggerNewRelease({
      userId: 'user-1',
      enabled: false,
      trigger: { triggerSource: 'manual', title: 'Test Release' },
    });

    expect(result).toEqual({
      ok: false,
      code: 'feature-disabled',
      message: 'Release-to-Revenue autopilot is not enabled for this account.',
    });
  });

  it('creates a manual release run with metadata for the design partner', async () => {
    const result = await triggerNewRelease({
      userId: 'user-1',
      enabled: true,
      trigger: {
        triggerSource: 'manual',
        title: 'Neon Sky',
        artworkUrl: 'https://cdn.example.com/neon.jpg',
        slug: 'neon-sky',
        links: [
          {
            providerId: 'spotify',
            url: 'https://open.spotify.com/album/123',
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run).toEqual({ runId: 'run-1', status: 'created' });
    expect(result.stepOutputs.triggerSource).toBe('manual');
    expect(result.stepOutputs.designPartner).toEqual(designPartner);
    expect(result.stepOutputs.release).toMatchObject({
      title: 'Neon Sky',
      artworkUrl: 'https://cdn.example.com/neon.jpg',
      smartLinkPath: '/timwhite/neon-sky',
    });
    expect(mockCreateReleaseToRevenueRun).toHaveBeenCalledOnce();
  });

  it('creates a catalog release run when the release exists', async () => {
    mockResolveReleaseMetadataFromCatalog.mockResolvedValue({
      releaseId: 'release-9',
      title: 'Catalog Single',
      artworkUrl: 'https://cdn.example.com/catalog.jpg',
      slug: 'catalog-single',
      smartLinkPath: '/timwhite/catalog-single',
      links: [
        { providerId: 'spotify', url: 'https://open.spotify.com/track/9' },
      ],
    });

    const result = await triggerNewRelease({
      userId: 'user-1',
      enabled: true,
      trigger: {
        triggerSource: 'catalog',
        releaseId: 'release-9',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockResolveReleaseMetadataFromCatalog).toHaveBeenCalledWith({
      creatorProfileId: 'profile-1',
      creatorUsername: 'timwhite',
      releaseId: 'release-9',
    });
    expect(result.stepOutputs.releaseId).toBe('release-9');
    expect(result.stepOutputs.release.title).toBe('Catalog Single');
  });

  it('rejects non-design-partner users', async () => {
    const result = await triggerNewRelease({
      userId: 'other-user',
      enabled: true,
      trigger: { triggerSource: 'manual', title: 'Blocked' },
    });

    expect(result).toEqual({
      ok: false,
      code: 'forbidden',
      message:
        'Only the configured design-partner artist can trigger autopilot runs.',
    });
  });
});
