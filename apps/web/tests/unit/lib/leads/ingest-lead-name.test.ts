import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  checkExistingProfile: vi.fn(),
  fetchFullExtractionProfile: vi.fn(),
  handleNewProfileIngest: vi.fn(),
  handleReingestProfile: vi.fn(),
  reconcileProfileSurfaces: vi.fn(),
  resolveHostedAvatarUrl: vi.fn(),
  selectLimit: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.selectLimit }) }),
    }),
    update: () => ({ set: mocks.updateSet }),
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/ingestion/flows/avatar-hosting', () => ({
  resolveHostedAvatarUrl: mocks.resolveHostedAvatarUrl,
}));
vi.mock('@/lib/ingestion/flows/full-extraction-flow', () => ({
  fetchFullExtractionProfile: mocks.fetchFullExtractionProfile,
}));
vi.mock('@/lib/ingestion/flows/profile-operations', () => ({
  checkExistingProfile: mocks.checkExistingProfile,
}));
vi.mock('@/lib/ingestion/flows/reingest-flow', () => ({
  handleNewProfileIngest: mocks.handleNewProfileIngest,
  handleReingestProfile: mocks.handleReingestProfile,
}));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspArtistDiscoveryJob: vi.fn(),
  enqueueMusicFetchEnrichmentJob: vi.fn(),
}));
vi.mock('@/lib/profile-surfaces/reconciliation', () => ({
  reconcileProfileSurfaces: mocks.reconcileProfileSurfaces,
}));

import type { Lead } from '@/lib/db/schema/leads';
import { ingestLeadAsCreator } from '@/lib/leads/ingest-lead';

function lead(displayName: string): Lead {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    linktreeHandle: 'megaran',
    linktreeUrl: 'https://linktr.ee/megaran',
    displayName,
    spotifyUrl: null,
  } as Lead;
}

describe('ingestLeadAsCreator display name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkExistingProfile.mockResolvedValue({
      existing: null,
      finalHandle: 'megaran',
      isReingest: false,
    });
    mocks.resolveHostedAvatarUrl.mockResolvedValue(null);
    mocks.handleNewProfileIngest.mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    mocks.handleReingestProfile.mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    mocks.reconcileProfileSurfaces.mockResolvedValue({
      sources: 0,
      surfaces: 0,
    });
    mocks.selectLimit.mockResolvedValue([
      { spotifyId: null, spotifyUrl: null },
    ]);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  });

  it.each([
    ['Mega Ran | Instagram, Facebook, Twitch', 'Mega Ran'],
    ['Tom River | Official Music, Tour Dates & Tickets', 'Tom River'],
    ['michaelaanne - Listen on Spotify, Apple Music', 'michaelaanne'],
    ['therealeternia | Instagram, Facebook', 'therealeternia'],
  ])('publishes %s as %s', async (rawTitle, artistName) => {
    mocks.fetchFullExtractionProfile.mockResolvedValue({
      avatarUrl: null,
      displayName: rawTitle,
    });

    await expect(ingestLeadAsCreator(lead(rawTitle))).resolves.toMatchObject({
      success: true,
    });

    expect(mocks.handleNewProfileIngest).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: artistName })
    );
  });

  it('keeps the raw scraped title on the lead as provenance', async () => {
    const rawTitle = 'Mega Ran | Instagram, Facebook, Twitch';
    mocks.fetchFullExtractionProfile.mockResolvedValue({
      avatarUrl: null,
      displayName: rawTitle,
    });
    mocks.handleNewProfileIngest.mockResolvedValue({
      json: async () => ({
        ok: true,
        profile: { id: 'profile-1', username: 'megaran' },
      }),
    });

    await ingestLeadAsCreator(lead(rawTitle));

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ displayName: expect.anything() })
    );
  });
});
