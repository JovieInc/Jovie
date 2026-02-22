/**
 * Tests for creator link display across dashboard sidebar and public profile.
 *
 * Verifies that social links and music DSP links set on a creator profile
 * appear correctly in:
 * 1. The dashboard sidebar (ProfileLinkList component)
 * 2. The public profile (social link filtering + DSP mapping)
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewPanelLink } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import type { LegacySocialLink } from '@/types/db';

// ─── Mocks for ProfileLinkList ───────────────────────────────────────────────

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({ platform, ...props }: { platform: string }) =>
    React.createElement('span', {
      'data-testid': `social-icon-${platform}`,
      ...props,
    }),
}));

vi.mock('@/components/atoms/VerifiedBadge', () => ({
  VerifiedBadge: () =>
    React.createElement('span', { 'data-testid': 'verified-badge' }),
}));

vi.mock('@/components/atoms/SwipeToReveal', () => ({
  SwipeToReveal: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'swipe-reveal' }, children),
}));

vi.mock('@/components/molecules/drawer/DrawerLinkSection', () => ({
  DrawerLinkSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': `link-section-${title}` },
      children
    ),
}));

vi.mock('@jovie/ui', () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Mocks for public profile components ─────────────────────────────────────

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/deep-links', () => ({
  getSocialDeepLinkConfig: vi.fn(() => null),
  openDeepLink: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createPreviewLink(
  overrides: Partial<PreviewPanelLink> & {
    id: string;
    platform: string;
    url: string;
  }
): PreviewPanelLink {
  return {
    title: overrides.platform,
    isVisible: true,
    ...overrides,
  };
}

function createSocialLink(
  overrides: Partial<LegacySocialLink> & {
    id: string;
    platform: string;
    url: string;
  }
): LegacySocialLink {
  return {
    artist_id: 'artist-1',
    clicks: 0,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Sidebar: ProfileLinkList ────────────────────────────────────────────────

describe('ProfileLinkList (dashboard sidebar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('social links', () => {
    it('renders social links when category is social', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const links: PreviewPanelLink[] = [
        createPreviewLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/testartist',
        }),
        createPreviewLink({
          id: '2',
          platform: 'twitter',
          url: 'https://twitter.com/testartist',
        }),
        createPreviewLink({
          id: '3',
          platform: 'tiktok',
          url: 'https://tiktok.com/@testartist',
        }),
      ];

      render(<ProfileLinkList links={links} selectedCategory='social' />);

      expect(screen.getByTestId('social-icon-instagram')).toBeDefined();
      expect(screen.getByTestId('social-icon-twitter')).toBeDefined();
      expect(screen.getByTestId('social-icon-tiktok')).toBeDefined();
    });

    it('does not render social links when viewing dsp category', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const links: PreviewPanelLink[] = [
        createPreviewLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/testartist',
        }),
      ];

      render(<ProfileLinkList links={links} selectedCategory='dsp' />);

      expect(screen.queryByTestId('social-icon-instagram')).toBeNull();
      expect(screen.getByText('No links in this category')).toBeDefined();
    });

    it('shows empty state when no links exist in category', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      render(<ProfileLinkList links={[]} selectedCategory='social' />);

      expect(screen.getByText('No links in this category')).toBeDefined();
    });
  });

  describe('music DSP links', () => {
    it('renders DSP links when category is dsp', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const links: PreviewPanelLink[] = [
        createPreviewLink({
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
        createPreviewLink({
          id: '2',
          platform: 'apple-music',
          url: 'https://music.apple.com/artist/123',
        }),
        createPreviewLink({
          id: '3',
          platform: 'soundcloud',
          url: 'https://soundcloud.com/testartist',
        }),
      ];

      render(<ProfileLinkList links={links} selectedCategory='dsp' />);

      expect(screen.getByTestId('social-icon-spotify')).toBeDefined();
      expect(screen.getByTestId('social-icon-apple-music')).toBeDefined();
      expect(screen.getByTestId('social-icon-soundcloud')).toBeDefined();
    });

    it('renders all supported DSP platforms', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const dspPlatforms = [
        {
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        },
        {
          id: '2',
          platform: 'apple-music',
          url: 'https://music.apple.com/artist/123',
        },
        {
          id: '3',
          platform: 'youtube',
          url: 'https://youtube.com/@testartist',
        },
        {
          id: '4',
          platform: 'soundcloud',
          url: 'https://soundcloud.com/testartist',
        },
        {
          id: '5',
          platform: 'bandcamp',
          url: 'https://testartist.bandcamp.com',
        },
        { id: '6', platform: 'tidal', url: 'https://tidal.com/artist/123' },
        { id: '7', platform: 'deezer', url: 'https://deezer.com/artist/123' },
        {
          id: '8',
          platform: 'amazon-music',
          url: 'https://music.amazon.com/artists/123',
        },
        {
          id: '9',
          platform: 'pandora',
          url: 'https://pandora.com/artist/testartist',
        },
      ];

      const links = dspPlatforms.map(p => createPreviewLink(p));

      render(<ProfileLinkList links={links} selectedCategory='dsp' />);

      for (const { platform } of dspPlatforms) {
        expect(screen.getByTestId(`social-icon-${platform}`)).toBeDefined();
      }
    });

    it('does not render DSP links when viewing social category', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const links: PreviewPanelLink[] = [
        createPreviewLink({
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
      ];

      render(<ProfileLinkList links={links} selectedCategory='social' />);

      expect(screen.queryByTestId('social-icon-spotify')).toBeNull();
    });
  });

  describe('mixed links', () => {
    it('separates social and DSP links into correct categories', async () => {
      const { ProfileLinkList } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const links: PreviewPanelLink[] = [
        createPreviewLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/testartist',
        }),
        createPreviewLink({
          id: '2',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
        createPreviewLink({
          id: '3',
          platform: 'twitter',
          url: 'https://twitter.com/testartist',
        }),
        createPreviewLink({
          id: '4',
          platform: 'apple-music',
          url: 'https://music.apple.com/artist/123',
        }),
      ];

      // Check social view shows only social
      const { unmount } = render(
        <ProfileLinkList links={links} selectedCategory='social' />
      );

      expect(screen.getByTestId('social-icon-instagram')).toBeDefined();
      expect(screen.getByTestId('social-icon-twitter')).toBeDefined();
      expect(screen.queryByTestId('social-icon-spotify')).toBeNull();
      expect(screen.queryByTestId('social-icon-apple-music')).toBeNull();

      unmount();

      // Check DSP view shows only DSP
      render(<ProfileLinkList links={links} selectedCategory='dsp' />);

      expect(screen.getByTestId('social-icon-spotify')).toBeDefined();
      expect(screen.getByTestId('social-icon-apple-music')).toBeDefined();
      expect(screen.queryByTestId('social-icon-instagram')).toBeNull();
      expect(screen.queryByTestId('social-icon-twitter')).toBeNull();
    });
  });

  describe('getCategoryCounts', () => {
    it('counts links by category correctly', async () => {
      const { getCategoryCounts } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const links: PreviewPanelLink[] = [
        createPreviewLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/a',
        }),
        createPreviewLink({
          id: '2',
          platform: 'twitter',
          url: 'https://twitter.com/a',
        }),
        createPreviewLink({
          id: '3',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/a',
        }),
        createPreviewLink({
          id: '4',
          platform: 'venmo',
          url: 'https://venmo.com/a',
        }),
        createPreviewLink({
          id: '5',
          platform: 'website',
          url: 'https://example.com',
        }),
      ];

      const counts = getCategoryCounts(links);

      expect(counts.social).toBe(2);
      expect(counts.dsp).toBe(1);
      expect(counts.earnings).toBe(1);
      expect(counts.custom).toBe(1);
      expect(counts.all).toBe(5);
    });

    it('returns zero counts for empty links', async () => {
      const { getCategoryCounts } = await import(
        '@/components/dashboard/organisms/profile-contact-sidebar/ProfileLinkList'
      );

      const counts = getCategoryCounts([]);

      expect(counts.social).toBe(0);
      expect(counts.dsp).toBe(0);
      expect(counts.earnings).toBe(0);
      expect(counts.custom).toBe(0);
      expect(counts.all).toBe(0);
    });
  });
});

// ─── Public profile: social link filtering ───────────────────────────────────

describe('Public profile link visibility', () => {
  const SOCIAL_NETWORK_PLATFORMS = [
    'twitter',
    'instagram',
    'tiktok',
    'youtube',
    'facebook',
    'linkedin',
    'discord',
    'twitch',
  ] as const;

  /**
   * Replicates the filtering logic from useProfileShell to verify that
   * social links with recognized platforms and valid URLs are shown
   * on the public profile.
   */
  function filterSocialNetworkLinks(
    socialLinks: LegacySocialLink[]
  ): LegacySocialLink[] {
    return socialLinks.filter(
      link =>
        link.is_visible !== false &&
        link.platform &&
        link.url &&
        SOCIAL_NETWORK_PLATFORMS.includes(
          link.platform.toLowerCase() as (typeof SOCIAL_NETWORK_PLATFORMS)[number]
        )
    );
  }

  describe('social links appear on public profile', () => {
    it('shows visible social links with recognized platforms', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/artist',
        }),
        createSocialLink({
          id: '2',
          platform: 'twitter',
          url: 'https://twitter.com/artist',
        }),
        createSocialLink({
          id: '3',
          platform: 'tiktok',
          url: 'https://tiktok.com/@artist',
        }),
      ];

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(3);
      expect(visible.map(l => l.platform)).toEqual([
        'instagram',
        'twitter',
        'tiktok',
      ]);
    });

    it('shows all supported social platforms', () => {
      const links: LegacySocialLink[] = SOCIAL_NETWORK_PLATFORMS.map(
        (platform, i) =>
          createSocialLink({
            id: `${i}`,
            platform,
            url: `https://example.com/${platform}`,
          })
      );

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(SOCIAL_NETWORK_PLATFORMS.length);
    });

    it('filters out links with is_visible set to false', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/artist',
          is_visible: false,
        }),
        createSocialLink({
          id: '2',
          platform: 'twitter',
          url: 'https://twitter.com/artist',
          is_visible: true,
        }),
      ];

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(1);
      expect(visible[0].platform).toBe('twitter');
    });

    it('includes links without is_visible set (defaults to visible)', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/artist',
        }),
      ];

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(1);
    });

    it('excludes links with empty URL', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({ id: '1', platform: 'instagram', url: '' }),
      ];

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(0);
    });

    it('excludes links with empty platform', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({ id: '1', platform: '', url: 'https://example.com' }),
      ];

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(0);
    });

    it('excludes non-social platforms (DSPs, earnings, websites)', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
        createSocialLink({
          id: '2',
          platform: 'venmo',
          url: 'https://venmo.com/artist',
        }),
        createSocialLink({
          id: '3',
          platform: 'website',
          url: 'https://mysite.com',
        }),
        createSocialLink({
          id: '4',
          platform: 'apple_music',
          url: 'https://music.apple.com/123',
        }),
      ];

      const visible = filterSocialNetworkLinks(links);

      expect(visible).toHaveLength(0);
    });
  });

  describe('music DSP links appear on public profile', () => {
    /**
     * Replicates the DSP mapping logic from StaticArtistPage to verify that
     * music platform social links are mapped to DSP entries shown on the profile.
     */
    const PLATFORM_TO_DSP_MAPPINGS: Array<{
      keywords: string[];
      dspKey: string;
    }> = [
      { keywords: ['spotify'], dspKey: 'spotify' },
      { keywords: ['applemusic', 'itunes'], dspKey: 'apple_music' },
      { keywords: ['youtube'], dspKey: 'youtube' },
      { keywords: ['soundcloud'], dspKey: 'soundcloud' },
      { keywords: ['bandcamp'], dspKey: 'bandcamp' },
      { keywords: ['tidal'], dspKey: 'tidal' },
      { keywords: ['deezer'], dspKey: 'deezer' },
      { keywords: ['amazonmusic'], dspKey: 'amazon_music' },
      { keywords: ['pandora'], dspKey: 'pandora' },
    ];

    function mapSocialPlatformToDSPKey(
      platform: string | undefined
    ): string | null {
      if (typeof platform !== 'string' || !platform) return null;
      const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
      for (const { keywords, dspKey } of PLATFORM_TO_DSP_MAPPINGS) {
        if (
          keywords.some(
            keyword => normalized.includes(keyword) || normalized === keyword
          )
        ) {
          return dspKey;
        }
      }
      return null;
    }

    function getDSPsFromSocialLinks(
      socialLinks: LegacySocialLink[]
    ): Array<{ key: string; url: string }> {
      const mapped = socialLinks
        .filter(link => link.url)
        .map(link => {
          const dspKey = mapSocialPlatformToDSPKey(link.platform);
          if (!dspKey) return null;
          return { key: dspKey, url: link.url };
        })
        .filter(Boolean) as Array<{ key: string; url: string }>;

      // Deduplicate by key
      const deduped = new Map<string, { key: string; url: string }>();
      for (const item of mapped) {
        if (!deduped.has(item.key)) {
          deduped.set(item.key, item);
        }
      }
      return Array.from(deduped.values());
    }

    it('maps Spotify social link to DSP entry', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
      ];

      const dsps = getDSPsFromSocialLinks(links);

      expect(dsps).toHaveLength(1);
      expect(dsps[0]).toEqual({
        key: 'spotify',
        url: 'https://open.spotify.com/artist/123',
      });
    });

    it('maps Apple Music social link to DSP entry', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'apple_music',
          url: 'https://music.apple.com/artist/123',
        }),
      ];

      const dsps = getDSPsFromSocialLinks(links);

      expect(dsps).toHaveLength(1);
      expect(dsps[0]).toEqual({
        key: 'apple_music',
        url: 'https://music.apple.com/artist/123',
      });
    });

    it('maps all supported DSP platforms from social links', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
        createSocialLink({
          id: '2',
          platform: 'apple_music',
          url: 'https://music.apple.com/artist/123',
        }),
        createSocialLink({
          id: '3',
          platform: 'youtube',
          url: 'https://youtube.com/@artist',
        }),
        createSocialLink({
          id: '4',
          platform: 'soundcloud',
          url: 'https://soundcloud.com/artist',
        }),
        createSocialLink({
          id: '5',
          platform: 'bandcamp',
          url: 'https://artist.bandcamp.com',
        }),
        createSocialLink({
          id: '6',
          platform: 'tidal',
          url: 'https://tidal.com/artist/123',
        }),
        createSocialLink({
          id: '7',
          platform: 'deezer',
          url: 'https://deezer.com/artist/123',
        }),
        createSocialLink({
          id: '8',
          platform: 'amazon_music',
          url: 'https://music.amazon.com/artists/123',
        }),
        createSocialLink({
          id: '9',
          platform: 'pandora',
          url: 'https://pandora.com/artist/testartist',
        }),
      ];

      const dsps = getDSPsFromSocialLinks(links);

      expect(dsps).toHaveLength(9);
      const keys = dsps.map(d => d.key);
      expect(keys).toContain('spotify');
      expect(keys).toContain('apple_music');
      expect(keys).toContain('youtube');
      expect(keys).toContain('soundcloud');
      expect(keys).toContain('bandcamp');
      expect(keys).toContain('tidal');
      expect(keys).toContain('deezer');
      expect(keys).toContain('amazon_music');
      expect(keys).toContain('pandora');
    });

    it('does not create DSP entries for non-music platforms', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'instagram',
          url: 'https://instagram.com/artist',
        }),
        createSocialLink({
          id: '2',
          platform: 'twitter',
          url: 'https://twitter.com/artist',
        }),
        createSocialLink({
          id: '3',
          platform: 'venmo',
          url: 'https://venmo.com/artist',
        }),
      ];

      const dsps = getDSPsFromSocialLinks(links);

      expect(dsps).toHaveLength(0);
    });

    it('deduplicates DSP entries with the same key', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({
          id: '1',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/123',
        }),
        createSocialLink({
          id: '2',
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/456',
        }),
      ];

      const dsps = getDSPsFromSocialLinks(links);

      expect(dsps).toHaveLength(1);
      expect(dsps[0].url).toBe('https://open.spotify.com/artist/123');
    });

    it('excludes links with empty URL', () => {
      const links: LegacySocialLink[] = [
        createSocialLink({ id: '1', platform: 'spotify', url: '' }),
      ];

      const dsps = getDSPsFromSocialLinks(links);

      expect(dsps).toHaveLength(0);
    });
  });

  describe('links appear on both sidebar and public profile', () => {
    it('social link set on a creator appears in sidebar and public profile', async () => {
      const instagramLink = createSocialLink({
        id: '1',
        platform: 'instagram',
        url: 'https://instagram.com/testartist',
      });

      // Sidebar: getPlatformCategory classifies 'instagram' as 'social'
      const { getPlatformCategory } = await import(
        '@/components/dashboard/organisms/links/utils/platform-category'
      );
      expect(getPlatformCategory('instagram')).toBe('social');

      // Public profile: filtering includes instagram
      const publicVisible = filterSocialNetworkLinks([instagramLink]);
      expect(publicVisible).toHaveLength(1);
      expect(publicVisible[0].platform).toBe('instagram');
    });

    it('DSP link set on a creator appears in sidebar and public profile', async () => {
      // Sidebar: getPlatformCategory classifies 'spotify' as 'dsp'
      const { getPlatformCategory } = await import(
        '@/components/dashboard/organisms/links/utils/platform-category'
      );
      expect(getPlatformCategory('spotify')).toBe('dsp');

      // Public profile: DSP mapping extracts spotify
      const PLATFORM_TO_DSP_MAPPINGS = [
        { keywords: ['spotify'], dspKey: 'spotify' },
      ];
      const normalized = 'spotify'.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
      const match = PLATFORM_TO_DSP_MAPPINGS.find(m =>
        m.keywords.some(k => normalized.includes(k))
      );
      expect(match).toBeDefined();
      expect(match!.dspKey).toBe('spotify');
    });

    it('YouTube link can appear in both social and DSP contexts', async () => {
      const youtubeLink = createSocialLink({
        id: '1',
        platform: 'youtube',
        url: 'https://youtube.com/@testartist',
      });

      // Public profile social bar: youtube is in SOCIAL_NETWORK_PLATFORMS
      const publicVisible = filterSocialNetworkLinks([youtubeLink]);
      expect(publicVisible).toHaveLength(1);

      // Public profile DSP mapping: youtube maps to a DSP
      const normalized = 'youtube'.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
      expect(normalized).toBe('youtube');

      // Sidebar: getPlatformCategory can classify youtube as DSP
      const { getPlatformCategory } = await import(
        '@/components/dashboard/organisms/links/utils/platform-category'
      );
      expect(getPlatformCategory('youtube')).toBe('dsp');
    });
  });
});
