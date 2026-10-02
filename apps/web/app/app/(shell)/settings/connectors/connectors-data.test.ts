import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const { getUserByClerkId, select } = vi.hoisted(() => ({
  getUserByClerkId: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { select } }));
vi.mock('@/lib/db/queries/shared', () => ({ getUserByClerkId }));

import { loadSettingsConnectorsData } from './connectors-data';

describe('loadSettingsConnectorsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserByClerkId.mockResolvedValue({ id: 'database-user' });
  });

  it('maps every provider and scopes YouTube state to the selected profile', async () => {
    select
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              provider: 'spotify',
              status: 'connected',
              providerAccountId: 'spotify-user',
              creatorProfileId: null,
              scopes: ['user-read-email'],
              capabilities: {},
              lastErrorUserMessage: null,
            },
            {
              provider: 'youtube',
              status: 'connected',
              providerAccountId: 'wrong-channel',
              creatorProfileId: 'other-profile',
              scopes: YOUTUBE_OAUTH_SCOPES,
              capabilities: { channelTitle: 'Wrong Channel' },
              lastErrorUserMessage: null,
            },
            {
              provider: 'youtube',
              status: 'connected',
              providerAccountId: 'channel-1',
              creatorProfileId: 'profile-1',
              scopes: YOUTUBE_OAUTH_SCOPES,
              capabilities: { channelTitle: 'Artist Channel' },
              lastErrorUserMessage: null,
            },
          ],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
        }),
      });

    const data = await loadSettingsConnectorsData(
      'better-auth-user',
      'profile-1'
    );

    expect(data?.connectors).toMatchObject({
      gmail: { status: 'not_connected' },
      google_calendar: { status: 'not_connected' },
      spotify: {
        status: 'connected',
        accountLabel: 'spotify-user',
        scopes: ['user-read-email'],
      },
      youtube: {
        status: 'connected',
        accountLabel: 'Artist Channel',
        scopes: YOUTUBE_OAUTH_SCOPES,
      },
    });
  });
  it('preserves action kind and missing confidence, and excludes Ovie recordings before limiting results', async () => {
    const where = vi.fn().mockReturnValue({
      orderBy: () => ({
        limit: async () => [
          {
            id: 'youtube',
            kind: 'youtube.thumbnail_experiment',
            payload: { title: 'Compare thumbnails' },
            sourceRefs: [],
            rationale: 'Compare approved artwork',
            status: 'pending',
          },
          {
            id: 'calendar',
            kind: 'calendar.create_event',
            payload: { title: 'Booking', confidence: 0 },
            sourceRefs: [{ messageId: 'email', subject: 'Confirmed' }],
            rationale: null,
            status: 'pending',
          },
          {
            id: 'malformed',
            kind: 'unknown',
            payload: null,
            sourceRefs: {},
            rationale: null,
            status: 'pending',
          },
        ],
      }),
    });
    select
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where }) });
    const data = await loadSettingsConnectorsData('user', null);
    expect(data?.suggestedActions).toMatchObject([
      {
        id: 'youtube',
        kind: 'youtube.thumbnail_experiment',
        title: 'Compare thumbnails',
        confidence: null,
      },
      {
        id: 'calendar',
        kind: 'calendar.create_event',
        confidence: 0,
        sourceRef: { subject: 'Confirmed' },
      },
      {
        id: 'malformed',
        kind: 'unknown',
        title: 'Untitled suggestion',
        confidence: null,
        sourceRef: { subject: '' },
      },
    ]);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('"suggested_actions"."kind" <>');
    expect(query.params).toContain('workflow_capture.request');
    expect(query.params).toContain('database-user');
    expect(query.params).toContain('pending');
  });
});
