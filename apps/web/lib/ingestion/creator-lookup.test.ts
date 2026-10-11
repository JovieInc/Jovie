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
  fetchInstagramDocument: hoisted.instagramFetch,
  extractInstagram: hoisted.instagramExtract,
}));
vi.mock('./strategies/tiktok', () => ({
  validateTikTokUrl: hoisted.tiktokValidate,
  fetchTikTokDocument: hoisted.tiktokFetch,
  extractTikTok: hoisted.tiktokExtract,
}));
vi.mock('./strategies/linktree', () => ({
  validateLinktreeUrl: hoisted.linktreeValidate,
  fetchLinktreeDocument: hoisted.linktreeFetch,
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
      platform: 'instagram',
      validate: hoisted.instagramValidate,
      fetchDocument: hoisted.instagramFetch,
      extract: hoisted.instagramExtract,
      input: 'https://instagram.com/creator',
      normalized: 'https://www.instagram.com/creator',
    },
    {
      platform: 'tiktok',
      validate: hoisted.tiktokValidate,
      fetchDocument: hoisted.tiktokFetch,
      extract: hoisted.tiktokExtract,
      input: 'https://tiktok.com/@creator',
      normalized: 'https://www.tiktok.com/@creator',
    },
    {
      platform: 'linktree',
      validate: hoisted.linktreeValidate,
      fetchDocument: hoisted.linktreeFetch,
      extract: hoisted.linktreeExtract,
      input: 'https://linktr.ee/creator',
      normalized: 'https://linktr.ee/creator',
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
    if (testCase.platform === 'linktree') {
      expect(testCase.extract).toHaveBeenCalledWith('<html>profile</html>', {
        includeContactEmail: false,
      });
    } else {
      expect(testCase.extract).toHaveBeenCalledWith('<html>profile</html>');
    }
  });

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
