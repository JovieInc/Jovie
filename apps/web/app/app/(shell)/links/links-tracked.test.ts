import { describe, expect, it } from 'vitest';
import { getDefaultQuickPresets } from '@/lib/utm';
import type { LinkRow } from './links-model';
import {
  buildLinksUtmContext,
  buildOneTapTrackedUrl,
  deriveLinksCampaignSlug,
  isAudienceSourceLinkRow,
} from './links-tracked';

const releaseRow: LinkRow = {
  id: 'release-9',
  jovieUrl: 'https://jov.ie/tim/midnight-city',
  title: 'Midnight City',
  type: 'Release',
  destination: 'https://open.spotify.com/album/xyz',
  status: 'active',
  clicks: 17,
  clicksLabel: '7d clicks',
  campaign: null,
  utmSummary: null,
  entityHref: '/app/releases/release-9',
  createdAt: null,
};

const profileRow: LinkRow = {
  id: 'profile',
  jovieUrl: 'https://jov.ie/tim',
  title: 'Tim',
  type: 'Profile',
  destination: 'https://jov.ie/tim',
  status: 'active',
  clicks: 3,
  clicksLabel: 'clicks',
  campaign: null,
  utmSummary: null,
  entityHref: '/app/chat?panel=profile',
  createdAt: null,
};

const socialRow: LinkRow = {
  id: 'social-1',
  jovieUrl: 'https://jov.ie/tim',
  title: 'instagram',
  type: 'Social',
  destination: 'https://instagram.com/tim',
  status: 'active',
  clicks: 12,
  clicksLabel: 'clicks',
  campaign: null,
  utmSummary: null,
  entityHref: null,
  createdAt: null,
};

const sourceRow: LinkRow = {
  id: 'source-link-1',
  jovieUrl: 'https://jov.ie/s/tour-abc12345',
  title: 'Fall tour poster',
  type: 'Release',
  destination: 'https://jov.ie/tim/album',
  status: 'active',
  clicks: 42,
  clicksLabel: 'scans',
  campaign: 'Fall Tour',
  utmSummary: 'qr_code / print / fall-tour',
  entityHref: '/app/releases/release-9',
  createdAt: null,
};

describe('links-tracked', () => {
  it('detects audience source rows by id prefix', () => {
    expect(isAudienceSourceLinkRow(sourceRow)).toBe(true);
    expect(isAudienceSourceLinkRow(releaseRow)).toBe(false);
    expect(isAudienceSourceLinkRow(profileRow)).toBe(false);
    expect(isAudienceSourceLinkRow(socialRow)).toBe(false);
  });

  it('derives campaign slugs from the Jovie URL path', () => {
    expect(deriveLinksCampaignSlug(releaseRow)).toBe('midnight-city');
    expect(deriveLinksCampaignSlug(profileRow)).toBe('tim');
    expect(deriveLinksCampaignSlug(sourceRow)).toBe('tour-abc12345');
  });

  it('builds UTM context for placeholder resolution', () => {
    expect(buildLinksUtmContext(releaseRow)).toEqual({
      baseUrl: 'https://jov.ie/tim/midnight-city',
      releaseSlug: 'midnight-city',
      releaseTitle: 'Midnight City',
    });
  });

  it('one-tap copies source short links without adding query UTMs', () => {
    expect(buildOneTapTrackedUrl(sourceRow)).toEqual({
      url: 'https://jov.ie/s/tour-abc12345',
      presetLabel: null,
    });
  });

  it('one-tap applies the default quick preset for profile, release, and social', () => {
    const defaultPreset = getDefaultQuickPresets()[0];
    expect(defaultPreset?.id).toBe('instagram-story');

    for (const row of [profileRow, releaseRow, socialRow]) {
      const tracked = buildOneTapTrackedUrl(row);
      expect(tracked.presetLabel).toBe('Instagram Story');
      expect(tracked.url).toContain('utm_source=instagram');
      expect(tracked.url).toContain('utm_medium=social');
      expect(tracked.url).toContain('utm_content=story');
      expect(tracked.url).toContain(
        `utm_campaign=${deriveLinksCampaignSlug(row)}`
      );
      expect(tracked.url.startsWith(row.jovieUrl)).toBe(true);
    }
  });
});
