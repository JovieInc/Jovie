import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildPitchInputMock: vi.fn(),
  generatePitchesMock: vi.fn(),
  whereMock: vi.fn(),
  setMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/lib/services/pitch/index', () => ({
  buildPitchInput: hoisted.buildPitchInputMock,
  generatePitches: hoisted.generatePitchesMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: hoisted.updateMock,
  },
}));

describe('generateAndSaveReleasePitches', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.whereMock.mockResolvedValue(undefined);
    hoisted.setMock.mockReturnValue({ where: hoisted.whereMock });
    hoisted.updateMock.mockReturnValue({ set: hoisted.setMock });
  });

  it('throws a typed error when the release context cannot be built', async () => {
    hoisted.buildPitchInputMock.mockRejectedValue(new Error('missing release'));

    const { generateAndSaveReleasePitches } = await import(
      '@/lib/services/pitch/save-generated-pitches'
    );

    await expect(
      generateAndSaveReleasePitches({
        profileId: 'profile_1',
        releaseId: 'release_1',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'Error',
        code: 'RELEASE_NOT_FOUND',
      })
    );
  });

  it('persists generated pitches onto the release record', async () => {
    hoisted.buildPitchInputMock.mockResolvedValue({
      artistName: 'Tim White',
      releaseTitle: 'Midnight Drive',
    });
    hoisted.generatePitchesMock.mockResolvedValue({
      pitches: {
        spotify: 'Spotify pitch',
        instagram: 'Instagram caption',
      },
    });

    const { generateAndSaveReleasePitches } = await import(
      '@/lib/services/pitch/save-generated-pitches'
    );

    const result = await generateAndSaveReleasePitches({
      profileId: 'profile_1',
      releaseId: 'release_1',
      instructions: 'Keep it cinematic.',
    });

    expect(hoisted.generatePitchesMock).toHaveBeenCalledWith(
      {
        artistName: 'Tim White',
        releaseTitle: 'Midnight Drive',
      },
      'Keep it cinematic.'
    );
    expect(hoisted.setMock).toHaveBeenCalledWith({
      generatedPitches: {
        spotify: 'Spotify pitch',
        instagram: 'Instagram caption',
      },
    });
    expect(result).toEqual({
      pitches: {
        spotify: 'Spotify pitch',
        instagram: 'Instagram caption',
      },
    });
  });
});
