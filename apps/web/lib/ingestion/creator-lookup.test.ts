import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  youtubeValidate: vi.fn(),
  youtubeFetch: vi.fn(),
  youtubeExtract: vi.fn(),
  instagramValidate: vi.fn(),
  instagramFetch: vi.fn(),
  instagramExtract: vi.fn(),
  tiktokValidate: vi.fn(),
  tiktokFetch: vi.fn(),
  tiktokExtract: vi.fn(),
  linktreeValidate: vi.fn(),
  linktreeFetch: vi.fn(),
  linktreeExtract: vi.fn(),
}));

vi.mock('./strategies/youtube', () => ({
  validateYouTubeChannelUrl: hoisted.youtubeValidate,
  fetchYouTubeAboutDocument: hoisted.youtubeFetch,
  extractYouTube: hoisted.youtubeExtract,
}));
vi.mock('./strategies/instagram', () => ({
  validateInstagramUrl: hoisted.instagramValidate,
  extractInstagram: hoisted.instagramExtract,
}));
vi.mock('./strategies/tiktok', () => ({
  validateTikTokUrl: hoisted.tiktokValidate,
  fetchTikTokDocument: hoisted.tiktokFetch,
  extractTikTok: hoisted.tiktokExtract,
}));
vi.mock('./strategies/linktree', () => ({
  validateLinktreeUrl: hoisted.linktreeValidate,
  extractLinktree: hoisted.linktreeExtract,
}));

const { lookupCreator } = await import('./creator-lookup');

describe('lookupCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const validate of [
      hoisted.youtubeValidate,
      hoisted.instagramValidate,
      hoisted.tiktokValidate,
      hoisted.linktreeValidate,
    ]) {
      validate.mockReturnValue(null);
    }
  });

  it.each([
    {
      platform: 'youtube',
      validate: hoisted.youtubeValidate,
      fetchDocument: hoisted.youtubeFetch,
      extract: hoisted.youtubeExtract,
      input: 'https://youtube.com/@creator',
      normalized: 'https://www.youtube.com/@creator/about',
    },

    {
      platform: 'tiktok',
      validate: hoisted.tiktokValidate,
      fetchDocument: hoisted.tiktokFetch,
      extract: hoisted.tiktokExtract,
      input: 'https://tiktok.com/@creator',
      normalized: 'https://www.tiktok.com/@creator',
    },
  ])('extracts public $platform fields without persistence', async testCase => {
    testCase.validate.mockReturnValue(testCase.normalized);
    testCase.fetchDocument.mockResolvedValue('<html>profile</html>');
    testCase.extract.mockReturnValue({
      displayName: 'Creator',
      bio: 'Public bio',
      avatarUrl: 'https://images.example/avatar.jpg',
      links: [{ url: 'https://creator.example' }],
      contactEmail: 'private@example.com',
      discoveredPixels: { facebookPixelId: '123' },
    });

    await expect(lookupCreator(testCase.input)).resolves.toEqual({
      platform: testCase.platform,
      sourceUrl: testCase.normalized,
      displayName: 'Creator',
      bio: 'Public bio',
      avatarUrl: 'https://images.example/avatar.jpg',
      links: [{ url: 'https://creator.example' }],
    });
    expect(testCase.fetchDocument).toHaveBeenCalledWith(testCase.normalized);
    expect(testCase.extract).toHaveBeenCalledWith('<html>profile</html>');
  });

  it.each([
    {
      validate: hoisted.instagramValidate,
      url: 'https://www.instagram.com/creator',
    },
    { validate: hoisted.linktreeValidate, url: 'https://linktr.ee/creator' },
  ])(
    'rejects retired sources before their extractors run ($url)',
    async ({ validate, url }) => {
      validate.mockReturnValue(url);
      await expect(lookupCreator(url)).rejects.toMatchObject({
        code: 'SOCIAL_HTML_DISABLED',
      });
      expect(hoisted.instagramFetch).not.toHaveBeenCalled();
      expect(hoisted.linktreeFetch).not.toHaveBeenCalled();
      expect(hoisted.instagramExtract).not.toHaveBeenCalled();
      expect(hoisted.linktreeExtract).not.toHaveBeenCalled();
    }
  );

  it('returns null without fetching when the URL is unsupported', async () => {
    await expect(
      lookupCreator('https://example.com/creator')
    ).resolves.toBeNull();

    expect(hoisted.youtubeFetch).not.toHaveBeenCalled();
    expect(hoisted.instagramFetch).not.toHaveBeenCalled();
    expect(hoisted.tiktokFetch).not.toHaveBeenCalled();
    expect(hoisted.linktreeFetch).not.toHaveBeenCalled();
  });
});
