import { describe, expect, it } from 'vitest';
import type { AudienceSourceLink } from '@/lib/db/schema/analytics';
import type { SocialLink } from '@/lib/db/schema/links';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  buildProfileLinkRow,
  buildReleaseLinkRow,
  buildSocialLinkRow,
  buildSourceLinkRow,
  destinationKindLabel,
  summarizeUtmParams,
} from './links-model';

const sourceLink: AudienceSourceLink = {
  id: 'link-1',
  creatorProfileId: 'profile-1',
  sourceGroupId: 'group-1',
  code: 'tour-abc12345',
  name: 'Fall tour poster',
  sourceType: 'qr',
  destinationKind: 'release',
  destinationId: 'release-9',
  destinationUrl: 'https://jov.ie/tim/album',
  utmParams: { source: 'qr_code', medium: 'print', campaign: 'fall-tour' },
  metadata: {},
  scanCount: 42,
  lastScannedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
} as AudienceSourceLink;

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-9',
  title: 'Midnight City',
  status: 'released',
  slug: 'midnight-city',
  smartLinkPath: '/tim/midnight-city',
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/xyz',
      source: 'manual',
      updatedAt: '2026-09-01T00:00:00Z',
      label: 'Spotify',
      path: '/tim/midnight-city/spotify',
      isPrimary: true,
    },
  ],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  weeklyStreams: 17,
} as unknown as ReleaseViewModel;

const socialLink: SocialLink = {
  id: 'social-1',
  creatorProfileId: 'profile-1',
  platform: 'instagram',
  platformType: 'social',
  url: 'https://instagram.com/tim',
  displayText: null,
  sortOrder: 0,
  clicks: 12,
  isActive: true,
  state: 'active',
  confidence: '1.00',
  sourcePlatform: null,
  sourceType: 'manual',
  evidence: {},
  verificationToken: null,
  verificationStatus: 'unverified',
  verificationCheckedAt: null,
  verifiedAt: null,
  version: 1,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
} as SocialLink;

describe('destinationKindLabel', () => {
  it('maps stored destination kinds to entity type labels', () => {
    expect(destinationKindLabel('release')).toBe('Release');
    expect(destinationKindLabel('tour_date')).toBe('Event');
    expect(destinationKindLabel('merch')).toBe('Merch');
    expect(destinationKindLabel('video')).toBe('Video');
    expect(destinationKindLabel('social')).toBe('Social');
    expect(destinationKindLabel('unknown-kind')).toBe('Link');
  });
});

describe('summarizeUtmParams', () => {
  it('joins present utm values in canonical order', () => {
    expect(summarizeUtmParams({ medium: 'print', source: 'qr_code' })).toBe(
      'qr_code / print'
    );
    expect(summarizeUtmParams({})).toBeNull();
    expect(summarizeUtmParams(null)).toBeNull();
  });
});

describe('buildSourceLinkRow', () => {
  it('exposes the trackable short link with scans, utm summary, and entity href', () => {
    const row = buildSourceLinkRow(sourceLink, 'Fall Tour');

    expect(row.jovieUrl).toMatch(/\/s\/tour-abc12345$/);
    expect(row.title).toBe('Fall tour poster');
    expect(row.type).toBe('Release');
    expect(row.destination).toBe('https://jov.ie/tim/album');
    expect(row.status).toBe('active');
    expect(row.clicks).toBe(42);
    expect(row.campaign).toBe('Fall Tour');
    expect(row.utmSummary).toBe('qr_code / print / fall-tour');
    expect(row.entityHref).toBe('/app/releases/release-9');
  });

  it('marks archived links archived', () => {
    const row = buildSourceLinkRow(
      { ...sourceLink, archivedAt: new Date() },
      null
    );
    expect(row.status).toBe('archived');
    expect(row.campaign).toBeNull();
  });
});

describe('buildReleaseLinkRow', () => {
  it('exposes the canonical release smart link back to its entity', () => {
    const row = buildReleaseLinkRow(release);

    expect(row.jovieUrl).toMatch(/\/tim\/midnight-city$/);
    expect(row.type).toBe('Release');
    expect(row.destination).toBe('https://open.spotify.com/album/xyz');
    expect(row.status).toBe('active');
    expect(row.clicks).toBe(17);
    expect(row.entityHref).toBe('/app/releases/release-9');
  });

  it('maps draft and scheduled releases to matching link statuses', () => {
    expect(buildReleaseLinkRow({ ...release, status: 'draft' }).status).toBe(
      'draft'
    );
    expect(
      buildReleaseLinkRow({ ...release, status: 'scheduled' }).status
    ).toBe('scheduled');
  });
});

describe('buildProfileLinkRow', () => {
  it('builds the canonical profile smart link row', () => {
    const row = buildProfileLinkRow({
      handle: 'tim',
      title: 'Tim White',
      clicks: 5,
    });
    expect(row.jovieUrl).toMatch(/\/tim$/);
    expect(row.type).toBe('Profile');
    expect(row.clicks).toBe(5);
  });
});

describe('buildSocialLinkRow', () => {
  it('exposes social profiles with click counts and external destination', () => {
    const row = buildSocialLinkRow({
      link: socialLink,
      profileUrl: 'https://jov.ie/tim',
    });
    expect(row.jovieUrl).toBe('https://jov.ie/tim');
    expect(row.title).toBe('instagram');
    expect(row.destination).toBe('https://instagram.com/tim');
    expect(row.clicks).toBe(12);
    expect(row.status).toBe('active');
  });
});
