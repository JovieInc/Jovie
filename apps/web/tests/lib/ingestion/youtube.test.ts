import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import {
  extractYouTube,
  extractYouTubeHandle,
  fetchYouTubeAboutDocument,
  isYouTubeChannelUrl,
  validateYouTubeChannelUrl,
} from '@/lib/ingestion/strategies/youtube';

// Load fixtures at module scope to avoid I/O overhead in tests
const FIXTURES = {
  structured: readFileSync(
    path.join(__dirname, 'fixtures', 'youtube', 'structured.html'),
    'utf-8'
  ),
  edgeCase: readFileSync(
    path.join(__dirname, 'fixtures', 'youtube', 'edge-case.html'),
    'utf-8'
  ),
} as const;

describe('YouTube Strategy', () => {
  describe('isYouTubeChannelUrl', () => {
    it('accepts valid @handle URLs', () => {
      expect(isYouTubeChannelUrl('https://youtube.com/@artistname')).toBe(true);
      expect(isYouTubeChannelUrl('https://www.youtube.com/@artistname')).toBe(
        true
      );
      expect(isYouTubeChannelUrl('https://youtube.com/@Artist_Name123')).toBe(
        true
      );
    });

    it('accepts valid /channel/ URLs', () => {
      expect(
        isYouTubeChannelUrl('https://youtube.com/channel/UC1234567890abcdef')
      ).toBe(true);
      expect(
        isYouTubeChannelUrl('https://www.youtube.com/channel/UC1234567890')
      ).toBe(true);
    });

    it('accepts valid /c/ URLs', () => {
      expect(isYouTubeChannelUrl('https://youtube.com/c/channelname')).toBe(
        true
      );
      expect(isYouTubeChannelUrl('https://www.youtube.com/c/ChannelName')).toBe(
        true
      );
    });

    it('upgrades HTTP URLs to HTTPS via normalizeUrl', () => {
      // normalizeUrl upgrades http to https, so these are valid
      expect(isYouTubeChannelUrl('http://youtube.com/@artistname')).toBe(true);
    });

    it('rejects non-channel YouTube URLs', () => {
      expect(isYouTubeChannelUrl('https://youtube.com/watch?v=abc123')).toBe(
        false
      );
      expect(isYouTubeChannelUrl('https://youtube.com/playlist?list=abc')).toBe(
        false
      );
      expect(isYouTubeChannelUrl('https://youtube.com/')).toBe(false);
      expect(isYouTubeChannelUrl('https://youtube.com')).toBe(false);
    });

    it('rejects invalid hosts', () => {
      expect(isYouTubeChannelUrl('https://fake-youtube.com/@artist')).toBe(
        false
      );
      expect(isYouTubeChannelUrl('https://youtube.com.fake.com/@artist')).toBe(
        false
      );
      expect(isYouTubeChannelUrl('https://youtu.be/@artist')).toBe(false);
    });

    it('handles malformed URLs gracefully', () => {
      expect(isYouTubeChannelUrl('')).toBe(false);
      expect(isYouTubeChannelUrl('not-a-url')).toBe(false);
      expect(isYouTubeChannelUrl('://youtube.com/@artist')).toBe(false);
    });
  });

  describe('validateYouTubeChannelUrl', () => {
    it('returns the canonical about URL and keeps the channel identity', () => {
      expect(validateYouTubeChannelUrl('https://youtube.com/@artist')).toBe(
        'https://www.youtube.com/@artist/about'
      );
      expect(
        validateYouTubeChannelUrl('https://www.youtube.com/channel/UC123abc')
      ).toBe('https://www.youtube.com/channel/UC123abc/about');
      expect(
        validateYouTubeChannelUrl('http://youtube.com/c/Name/videos?x=1')
      ).toBe('https://www.youtube.com/c/Name/about');
    });

    it('is idempotent, so a validated URL can be fetched (JOV-7725)', () => {
      // Regression: the about URL used to come back as /artist or /channel,
      // which failed re-validation inside fetchYouTubeAboutDocument and made
      // every creator lookup and YouTube ingestion job fail.
      for (const input of [
        'https://youtube.com/@artist',
        'https://youtube.com/@artist/about',
        'https://www.youtube.com/channel/UC123abc',
      ]) {
        const once = validateYouTubeChannelUrl(input);
        expect(once).not.toBeNull();
        expect(validateYouTubeChannelUrl(once as string)).toBe(once);
        expect(isYouTubeChannelUrl(once as string)).toBe(true);
      }
    });

    it('rejects credentials and look-alike hosts', () => {
      expect(
        validateYouTubeChannelUrl('https://u:p@youtube.com/@a')
      ).toBeNull();
      expect(
        validateYouTubeChannelUrl('https://youtube.com.evil.com/@a')
      ).toBeNull();
      expect(
        validateYouTubeChannelUrl('https://youtube.com/watch?v=1')
      ).toBeNull();
    });

    it('returns null for non-YouTube hosts', () => {
      expect(
        validateYouTubeChannelUrl('https://example.com/@artist')
      ).toBeNull();
    });

    it('returns null for root YouTube URLs without channel', () => {
      expect(validateYouTubeChannelUrl('https://youtube.com/')).toBeNull();
    });

    it('normalizes www prefix', () => {
      const result = validateYouTubeChannelUrl('https://youtube.com/@artist');
      expect(result).toContain('www.youtube.com');
    });
  });

  describe('extractYouTubeHandle', () => {
    it('extracts handle from @username URLs', () => {
      expect(extractYouTubeHandle('https://youtube.com/@artistname')).toBe(
        'artistname'
      );
      expect(extractYouTubeHandle('https://www.youtube.com/@ArtistName')).toBe(
        'artistname'
      );
    });

    it('extracts handle from /channel/ URLs', () => {
      expect(
        extractYouTubeHandle('https://youtube.com/channel/UC1234567890')
      ).toBe('uc1234567890');
    });

    it('extracts handle from /c/ URLs', () => {
      expect(extractYouTubeHandle('https://youtube.com/c/channelname')).toBe(
        'channelname'
      );
    });

    it('returns null for root URLs without handle', () => {
      expect(extractYouTubeHandle('https://youtube.com/')).toBeNull();
    });

    it('handles URLs with trailing paths', () => {
      expect(extractYouTubeHandle('https://youtube.com/@artist/videos')).toBe(
        'artist'
      );
      expect(extractYouTubeHandle('https://youtube.com/@artist/about')).toBe(
        'artist'
      );
    });

    it('handles non-YouTube URLs by extracting path segment', () => {
      // extractYouTubeHandle doesn't validate host, just extracts from path
      const result = extractYouTubeHandle('https://example.com/@artist');
      expect(result).toBe('artist');
    });
  });

  describe('extractYouTube', () => {
    it('extracts links from structured ytInitialData', () => {
      const html = FIXTURES.structured;
      const result = extractYouTube(html);

      expect(result.links.length).toBeGreaterThanOrEqual(3);

      const platforms = result.links.map(l => l.platformId).sort();
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('spotify');
      expect(platforms).toContain('twitter');
    });

    it('extracts display name from metadata', () => {
      const html = FIXTURES.structured;
      const result = extractYouTube(html);

      expect(result.displayName).toBe('Artist Name');
    });

    it('extracts avatar URL from header', () => {
      const html = FIXTURES.structured;
      const result = extractYouTube(html);

      expect(result.avatarUrl).toContain('yt3.googleusercontent.com');
    });

    it('detects official artist badge', () => {
      const html = FIXTURES.structured;
      const result = extractYouTube(html);

      const hasOfficialSignal = result.links.some(l =>
        l.evidence?.signals?.includes('youtube_official_artist')
      );
      expect(hasOfficialSignal).toBe(true);
    });

    it('handles edge cases with minimal data', () => {
      const html = FIXTURES.edgeCase;
      const result = extractYouTube(html);

      expect(result.displayName).toBe('Minimal Channel');
      expect(result.links.length).toBeGreaterThanOrEqual(1);
      expect(result.links.some(l => l.platformId === 'tiktok')).toBe(true);
    });

    it('handles empty HTML gracefully', () => {
      const result = extractYouTube('');
      expect(result.links).toEqual([]);
      expect(result.displayName).toBeNull();
      expect(result.avatarUrl).toBeNull();
    });

    it('handles HTML without ytInitialData', () => {
      const html = '<html><body>No data</body></html>';
      const result = extractYouTube(html);
      expect(result.links).toEqual([]);
      expect(result.displayName).toBeNull();
    });

    it('includes source platform evidence', () => {
      const html = FIXTURES.structured;
      const result = extractYouTube(html);

      for (const link of result.links) {
        expect(link.sourcePlatform).toBe('youtube');
        expect(link.evidence?.sources).toContain('youtube_about');
        expect(link.evidence?.signals).toContain('youtube_about_link');
      }
    });

    it('extracts all links (deduplication happens at processor level)', () => {
      // Note: Unlike Linktree, YouTube extraction doesn't deduplicate at extraction level
      // Deduplication happens in the ingestion processor when merging into the database
      const html = `
        <script id="ytInitialData">
        {
          "contents": {
            "twoColumnBrowseResultsRenderer": {
              "tabs": [{
                "tabRenderer": {
                  "title": "About",
                  "selected": true,
                  "content": {
                    "sectionListRenderer": {
                      "contents": [{
                        "itemSectionRenderer": {
                          "contents": [{
                            "channelAboutFullMetadataRenderer": {
                              "links": [
                                {"channelExternalLinkViewModel": {"link": {"href": "https://instagram.com/artist"}}},
                                {"channelExternalLinkViewModel": {"link": {"href": "https://www.instagram.com/artist"}}}
                              ]
                            }
                          }]
                        }
                      }]
                    }
                  }
                }
              }]
            }
          }
        }
        </script>
      `;
      const result = extractYouTube(html);
      // Both links are extracted; deduplication handled by processor
      expect(result.links.length).toBe(2);
    });
  });

  describe('fetchYouTubeAboutDocument', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(async () => {
      // Run any pending timers before cleanup to avoid unhandled rejections
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('throws ExtractionError for invalid URL', async () => {
      await expect(
        fetchYouTubeAboutDocument('https://example.com/@user')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError for non-channel YouTube URLs', async () => {
      await expect(
        fetchYouTubeAboutDocument('https://youtube.com/watch?v=abc123')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 404', async () => {
      // Use mockResolvedValue (not Once) to handle all retry attempts
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://www.youtube.com/@artist/about',
        headers: new Headers(),
      } as Response);

      await expect(
        fetchYouTubeAboutDocument('https://youtube.com/@artist')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 429 rate limit', async () => {
      // Use mockResolvedValue (not Once) to handle all retry attempts
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        url: 'https://www.youtube.com/@artist/about',
        headers: new Headers(),
      } as Response);

      await expect(
        fetchYouTubeAboutDocument('https://youtube.com/@artist')
      ).rejects.toThrow(ExtractionError);
    });

    it('returns HTML on success', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
        url: 'https://www.youtube.com/@artist/about',
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response);

      const result = await fetchYouTubeAboutDocument(
        'https://youtube.com/@artist'
      );
      expect(result).toBe(mockHtml);
    });
  });

  describe('current YouTube page shape (JOV-7725)', () => {
    const data = {
      metadata: {
        channelMetadataRenderer: {
          title: 'Live Artist',
          description: 'Metadata description',
        },
      },
      microformat: {
        microformatDataRenderer: {
          title: 'Live Artist',
          thumbnail: { thumbnails: [{ url: 'https://yt3.ggpht.com/a.jpg' }] },
        },
      },
      onResponseReceivedEndpoints: [
        {
          aboutChannelViewModel: {
            description: 'About panel bio',
            links: [
              {
                channelExternalLinkViewModel: {
                  link: {
                    content: 'twitter.com/liveartist',
                    commandRuns: [
                      {
                        onTap: {
                          innertubeCommand: {
                            urlEndpoint: {
                              url: 'https://www.youtube.com/redirect?event=channel_description&q=https%3A%2F%2Finstagram.com%2Fliveartist',
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
              {
                channelExternalLinkViewModel: {
                  link: { content: 'open.spotify.com/artist/abc123' },
                },
              },
            ],
          },
        },
      ],
    };
    const html = `<html><script nonce="x">var ytInitialData = ${JSON.stringify(
      data
    )};</script><script>var other = {"a":"}"};</script></html>`;

    it('reads ytInitialData from the inline assignment YouTube ships', () => {
      const result = extractYouTube(html);
      expect(result.displayName).toBe('Live Artist');
      expect(result.avatarUrl).toBe('https://yt3.ggpht.com/a.jpg');
      expect(result.bio).toBe('About panel bio');
      expect(result.links.map(link => link.platformId)).toEqual(
        expect.arrayContaining(['instagram', 'spotify'])
      );
      // The youtube.com/redirect wrapper is unwrapped to the real target.
      expect(
        result.links.some(link => link.url.includes('youtube.com/redirect'))
      ).toBe(false);
    });

    it('returns empty fields instead of throwing on malformed JSON', () => {
      const result = extractYouTube(
        '<script>var ytInitialData = {"a": </script>'
      );
      expect(result.displayName).toBeNull();
      expect(result.links).toEqual([]);
    });
  });
});
