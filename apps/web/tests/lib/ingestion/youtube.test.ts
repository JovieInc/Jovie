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
    it('returns normalized URL for valid channel inputs', () => {
      const result = validateYouTubeChannelUrl('https://youtube.com/@artist');
      // validatePlatformUrl strips @ prefix and normalizes handle (without /about)
      expect(result).toBe('https://www.youtube.com/artist');
    });

    it('handles existing /about suffix', () => {
      const result = validateYouTubeChannelUrl(
        'https://youtube.com/@artist/about'
      );
      // validatePlatformUrl normalizes the handle (about is stripped and re-added internally)
      expect(result).toBe('https://www.youtube.com/artist');
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
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
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
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(
        fetchYouTubeAboutDocument('https://youtube.com/@artist')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 429 rate limit', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
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
});
