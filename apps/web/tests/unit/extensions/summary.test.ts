import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getExtensionFlags,
  getMatchingDomainFlag,
} from '@/lib/extensions/flags';

const mockGetSessionContext = vi.hoisted(() => vi.fn());
const mockGetReleasesForProfile = vi.hoisted(() => vi.fn());
const mockDbSelectLimit = vi.hoisted(() => vi.fn());
const mockDbSelectOrderBy = vi.hoisted(() => vi.fn());
const mockDbSelectWhere = vi.hoisted(() => vi.fn());
const mockDbSelectFrom = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  mockDbSelectLimit.mockResolvedValue([]);
  mockDbSelectOrderBy.mockReturnValue({ limit: mockDbSelectLimit });
  mockDbSelectWhere.mockReturnValue({ orderBy: mockDbSelectOrderBy });
  mockDbSelectFrom.mockReturnValue({ where: mockDbSelectWhere });
  mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
});

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));
vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    id: 'id',
    platform: 'platform',
    url: 'url',
    creatorProfileId: 'creatorProfileId',
    state: 'state',
    updatedAt: 'updatedAt',
  },
}));
vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {
    id: 'id',
    title: 'title',
    startDate: 'startDate',
    venueName: 'venueName',
    city: 'city',
    region: 'region',
    country: 'country',
    ticketUrl: 'ticketUrl',
    profileId: 'profileId',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfile: mockGetReleasesForProfile,
}));

import { buildExtensionSummary } from '@/lib/extensions/summary';

describe('extension summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionContext.mockResolvedValue({
      profile: {
        id: 'profile_123',
        displayName: 'Night Shift',
        username: 'nightshift',
        usernameNormalized: 'nightshift',
        avatarUrl: null,
      },
    });
    mockGetReleasesForProfile.mockResolvedValue([]);
  });

  it('exposes only the DistroKid alpha surface', () => {
    const originalDisabledDomains = process.env.EXTENSION_DISABLED_DOMAINS;
    process.env.EXTENSION_DISABLED_DOMAINS = 'distrokid.com';

    try {
      expect(getExtensionFlags(true)).toEqual({
        signedIn: true,
        chatPromptEnabled: false,
        domains: [
          {
            host: 'distrokid.com',
            label: 'DistroKid',
            mode: 'off',
          },
        ],
      });
      expect(getMatchingDomainFlag('app.distrokid.com')).toEqual({
        host: 'distrokid.com',
        label: 'DistroKid',
        mode: 'off',
      });
    } finally {
      if (originalDisabledDomains === undefined) {
        delete process.env.EXTENSION_DISABLED_DOMAINS;
      } else {
        process.env.EXTENSION_DISABLED_DOMAINS = originalDisabledDomains;
      }
    }
  });

  it('treats non-DistroKid pages as unsupported', async () => {
    const summary = await buildExtensionSummary({
      pageUrl: 'https://mail.google.com/mail/u/0/#inbox',
      pageTitle: 'Inbox',
    });

    expect(summary).toMatchObject({
      status: 'unsupported',
      context: {
        pageKind: 'unsupported',
        host: 'mail.google.com',
        statusLabel: 'Unsupported Page',
      },
      shellCopy: {
        title: 'Open A DistroKid Release Form',
      },
      suggestion: null,
    });
    expect(summary.entities).toEqual([]);
    expect(summary.discoverySuggestions).toEqual([]);
  });

  it('returns release-only context for a DistroKid page', async () => {
    mockGetReleasesForProfile.mockResolvedValue([
      {
        id: 'release_123',
        title: 'Night Drive',
        artistNames: ['Night Shift'],
        artworkUrl: 'https://example.com/artwork.jpg',
        releaseDate: new Date('2026-02-20T00:00:00.000Z'),
        trackSummary: {
          primaryIsrc: 'USABC2600001',
        },
      },
    ]);

    const summary = await buildExtensionSummary({
      pageUrl: 'https://distrokid.com/new',
      pageTitle: 'Upload Music',
    });

    expect(summary.status).toBe('ready');
    expect(summary.context).toEqual({
      pageKind: 'release',
      host: 'distrokid.com',
      url: 'https://distrokid.com/new',
      title: 'Upload Music',
      statusLabel: 'DistroKid Release Form',
    });
    expect(summary.shellCopy).toEqual({
      title: 'Release Metadata Is Ready',
      body: 'Jovie pulled release details for Night Shift so you can review them before filling DistroKid.',
    });
    expect(summary.discoverySuggestions).toEqual([]);
    expect(summary.entities).toHaveLength(1);
    expect(summary.suggestion).toMatchObject({
      id: 'release_123',
      primaryAction: {
        kind: 'copy',
      },
    });
  });
});
