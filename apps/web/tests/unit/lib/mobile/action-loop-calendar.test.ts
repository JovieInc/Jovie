import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  getReleasesForProfileMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.dbSelectMock,
  },
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfile: hoisted.getReleasesForProfileMock,
}));

const { buildMobileCalendar } = await import(
  '@/lib/mobile/action-loop-calendar'
);

function mockTourDateRows(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  hoisted.dbSelectMock.mockReturnValue({ from });
}

describe('buildMobileCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T12:00:00.000Z'));
  });

  it('returns upcoming events, pending review, and upcoming releases', async () => {
    mockTourDateRows([
      {
        id: 'event-pending',
        profileId: 'profile-1',
        externalId: null,
        provider: 'bandsintown',
        eventType: 'tour',
        confirmationStatus: 'pending',
        reviewedAt: null,
        title: 'Brooklyn show',
        startDate: new Date('2026-07-10T20:00:00.000Z'),
        startTime: null,
        timezone: 'America/New_York',
        venueName: 'Brooklyn Steel',
        city: 'Brooklyn',
        region: 'NY',
        country: 'US',
        latitude: null,
        longitude: null,
        ticketUrl: null,
        ticketStatus: 'available',
        lastSyncedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      {
        id: 'event-confirmed',
        profileId: 'profile-1',
        externalId: null,
        provider: 'manual',
        eventType: 'livestream',
        confirmationStatus: 'confirmed',
        reviewedAt: new Date('2026-06-02T00:00:00.000Z'),
        title: 'Listening party',
        startDate: new Date('2026-07-15T20:00:00.000Z'),
        startTime: null,
        timezone: 'America/New_York',
        venueName: 'Online',
        city: 'New York',
        region: 'NY',
        country: 'US',
        latitude: null,
        longitude: null,
        ticketUrl: null,
        ticketStatus: 'available',
        lastSyncedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      {
        id: 'event-past',
        profileId: 'profile-1',
        externalId: null,
        provider: 'manual',
        eventType: 'tour',
        confirmationStatus: 'confirmed',
        reviewedAt: new Date('2026-05-01T00:00:00.000Z'),
        title: 'Past show',
        startDate: new Date('2026-06-01T20:00:00.000Z'),
        startTime: null,
        timezone: 'America/New_York',
        venueName: 'Old Venue',
        city: 'Boston',
        region: 'MA',
        country: 'US',
        latitude: null,
        longitude: null,
        ticketUrl: null,
        ticketStatus: 'available',
        lastSyncedAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);

    hoisted.getReleasesForProfileMock.mockResolvedValue([
      {
        id: 'release-1',
        title: 'Midnight Drive',
        releaseDate: new Date('2026-08-01T00:00:00.000Z'),
        status: 'scheduled',
        artworkUrl: 'https://cdn.example/art.jpg',
      },
      {
        id: 'release-2',
        title: 'Old Single',
        releaseDate: '2026-01-01T00:00:00.000Z',
        status: 'released',
        artworkUrl: undefined,
      },
    ]);

    const payload = await buildMobileCalendar('profile-1');

    expect(payload.pendingReviewCount).toBe(1);
    expect(payload.pendingEvents).toHaveLength(1);
    expect(payload.pendingEvents[0]?.id).toBe('event-pending');
    expect(payload.upcomingEvents.map(event => event.id)).toEqual([
      'event-pending',
      'event-confirmed',
    ]);
    expect(payload.upcomingReleases).toEqual([
      {
        id: 'release-1',
        title: 'Midnight Drive',
        releaseDate: '2026-08-01T00:00:00.000Z',
        status: 'scheduled',
        artworkUrl: 'https://cdn.example/art.jpg',
      },
    ]);
    expect(payload.chatPrompt).toBe(
      'Ask Jovie what I should prioritize on my calendar this week.'
    );
  });
});
