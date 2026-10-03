// @vitest-environment node
/**
 * JOV-7725: creator lookup against the page shapes each platform really
 * serves. These run the real validators, fetcher, and extractors with only
 * the network stubbed, so a validator/fetcher disagreement (the YouTube bug)
 * or a login wall reported as data (the Instagram bug) fails here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCreator } from '@/lib/ingestion/creator-lookup';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import { extractInstagram } from '@/lib/ingestion/strategies/instagram';
import { extractTikTok } from '@/lib/ingestion/strategies/tiktok';

function servePage(html: string) {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      requested.push(String(input));
      const response = new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
      // A real fetch reports the URL it ended on; the fetcher checks it.
      Object.defineProperty(response, 'url', { value: String(input) });
      return response;
    })
  );
  return requested;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const youtubePage = `<script>var ytInitialData = ${JSON.stringify({
  metadata: {
    channelMetadataRenderer: { title: 'Real Channel', description: 'Bio' },
  },
})};</script>`;

const tiktokPage = (detail: unknown) =>
  `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
    { __DEFAULT_SCOPE__: { 'webapp.user-detail': detail } }
  )}</script>`;

const instagramProfile = `<meta property="og:type" content="profile" />
<meta property="og:title" content="Taylor Swift (&#064;taylorswift) &#x2022; Instagram photos and videos" />
<meta property="og:image" content="https://scontent.cdninstagram.com/a.jpg" />
<meta property="og:description" content="273M Followers, 0 Following, 713 Posts - See Instagram photos and videos from Taylor Swift" />`;

const instagramLoginWall = `<title>Instagram</title>
<meta property="og:title" content="Instagram" />
<meta property="og:image" content="https://static.cdninstagram.com/rsrc.php/v4/yD/r/logo.png" />`;

describe('creator lookup source pages', () => {
  it.each([
    'https://www.youtube.com/@creator',
    'https://youtube.com/channel/UC123abc',
  ])('fetches the about page and returns data for %s', async url => {
    const requested = servePage(youtubePage);
    const result = await lookupCreator(url);
    expect(requested[0]).toMatch(/^https:\/\/www\.youtube\.com\/.+\/about$/);
    expect(result).toMatchObject({
      platform: 'youtube',
      displayName: 'Real Channel',
      bio: 'Bio',
    });
  });

  it('reads TikTok profile fields from the rehydration payload', async () => {
    servePage(
      tiktokPage({
        statusCode: 0,
        userInfo: {
          user: {
            nickname: 'Khabane lame',
            signature: 'Learn from my videos',
            avatarLarger: 'https://p16.tiktokcdn.com/a.jpeg',
            bioLink: { link: 'linktr.ee/khaby' },
          },
        },
      })
    );
    const result = await lookupCreator('https://www.tiktok.com/@khaby.lame');
    expect(result).toMatchObject({
      platform: 'tiktok',
      displayName: 'Khabane lame',
      bio: 'Learn from my videos',
      avatarUrl: 'https://p16.tiktokcdn.com/a.jpeg',
    });
    expect(result?.links.map(link => link.platformId)).toContain('linktree');
  });

  it('reports a missing TikTok profile as not found', () => {
    expect(() => extractTikTok(tiktokPage({ statusCode: 10221 }))).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });

  it('never returns a blank 200 for a TikTok bot wall', async () => {
    servePage('<html><body>Please wait...</body></html>');
    await expect(
      lookupCreator('https://www.tiktok.com/@someone')
    ).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('reports an Instagram login wall instead of "Instagram" as the creator', () => {
    let error: unknown;
    try {
      extractInstagram(instagramLoginWall);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('LOGIN_REQUIRED');
  });

  it('keeps the real Instagram name and drops follower counts as bio', () => {
    const result = extractInstagram(instagramProfile);
    expect(result.displayName).toBe('Taylor Swift');
    expect(result.bio).toBeNull();
    expect(result.avatarUrl).toBe('https://scontent.cdninstagram.com/a.jpg');
  });
});
