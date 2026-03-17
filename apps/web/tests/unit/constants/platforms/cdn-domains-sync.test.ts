import { describe, expect, it } from 'vitest';
import {
  getAllImageDomainPatterns,
  getCspImgSrcDomains,
  getDspCdnDomains,
  getImageServingPlatformIds,
  PLATFORM_CDN_DOMAINS,
} from '@/constants/platforms/cdn-domains';
import { ALL_PLATFORMS } from '@/constants/platforms/data';

describe('CDN domain registry', () => {
  describe('platform coverage', () => {
    it('has an entry for every music/social/creator platform', () => {
      const requiredIds = getImageServingPlatformIds();
      const registeredIds = Object.keys(PLATFORM_CDN_DOMAINS);

      const missing = requiredIds.filter(id => !registeredIds.includes(id));
      expect(missing).toEqual([]);
    });

    it('only references valid platform IDs', () => {
      const allPlatformIds: Set<string> = new Set(ALL_PLATFORMS.map(p => p.id));
      // Allow link aggregator entries (linktree) even though not music/social/creator
      const knownNonPlatformKeys: string[] = [];
      const invalidKeys = Object.keys(PLATFORM_CDN_DOMAINS).filter(
        id => !allPlatformIds.has(id) && !knownNonPlatformKeys.includes(id)
      );
      expect(invalidKeys).toEqual([]);
    });
  });

  describe('getAllImageDomainPatterns', () => {
    it('returns a deduplicated array', () => {
      const patterns = getAllImageDomainPatterns();
      const unique = [...new Set(patterns)];
      expect(patterns).toEqual(unique);
    });

    it('includes platform and infrastructure domains', () => {
      const patterns = getAllImageDomainPatterns();
      // Platform domains
      expect(patterns).toContain('i.scdn.co');
      expect(patterns).toContain('*.tiktokcdn.com');
      expect(patterns).toContain('*.ytimg.com');
      // Infrastructure domains
      expect(patterns).toContain('img.clerk.com');
      expect(patterns).toContain('*.blob.vercel-storage.com');
    });
  });

  describe('getCspImgSrcDomains', () => {
    it('prefixes every domain with https://', () => {
      const domains = getCspImgSrcDomains();
      for (const domain of domains) {
        expect(domain).toMatch(/^https:\/\//);
      }
    });

    it('contains key social CDN domains', () => {
      const domains = getCspImgSrcDomains();
      expect(domains).toContain('https://*.fbcdn.net');
      expect(domains).toContain('https://*.twimg.com');
      expect(domains).toContain('https://*.ytimg.com');
      expect(domains).toContain('https://*.tiktokcdn.com');
      expect(domains).toContain('https://*.licdn.com');
      expect(domains).toContain('https://*.googleusercontent.com');
    });
  });

  describe('getDspCdnDomains', () => {
    it('only contains domains from music-category platforms', () => {
      const dspDomains = getDspCdnDomains();
      const musicPlatformIds: Set<string> = new Set(
        ALL_PLATFORMS.filter(p => p.category === 'music').map(p => p.id)
      );

      // All returned domains should come from music platform entries
      const allMusicDomains = Object.entries(PLATFORM_CDN_DOMAINS)
        .filter(([id]) => musicPlatformIds.has(id))
        .flatMap(([, patterns]) =>
          patterns.map(p => (p.startsWith('*.') ? p.slice(2) : p))
        );

      for (const domain of dspDomains) {
        expect(allMusicDomains).toContain(domain);
      }
    });

    it('strips wildcard prefixes', () => {
      const dspDomains = getDspCdnDomains();
      for (const domain of dspDomains) {
        expect(domain).not.toMatch(/^\*\./);
      }
    });

    it('includes key DSP domains', () => {
      const dspDomains = getDspCdnDomains();
      expect(dspDomains).toContain('scdn.co');
      expect(dspDomains).toContain('mzstatic.com');
      expect(dspDomains).toContain('dzcdn.net');
      expect(dspDomains).toContain('sndcdn.com');
      expect(dspDomains).toContain('bcbits.com');
    });
  });

  describe('next.config.js sync', () => {
    it('remotePatterns covers all canonical domains', () => {
      const nextConfig = require('../../../../next.config.js');
      const remoteHostnames = new Set(
        nextConfig.images.remotePatterns.map(
          (p: { hostname: string }) => p.hostname
        )
      );

      const canonicalPatterns = getAllImageDomainPatterns();
      const missing = canonicalPatterns.filter(
        pattern => !remoteHostnames.has(pattern)
      );

      expect(missing).toEqual([]);
    });
  });
});
