import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YouTubeChannelPilotPanel } from './YouTubeChannelPilotPanel';

describe('YouTubeChannelPilotPanel', () => {
  it('fails closed until founder OAuth binds one owned channel', () => {
    render(
      <YouTubeChannelPilotPanel
        workspace={{
          state: 'auth-required',
          videos: [],
          errorMessage: null,
        }}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Founder Authorization Required' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Connector Settings' })
    ).toHaveAttribute('href', '/app/settings/connectors');
  });

  it('renders every authorized-channel video with honest API freshness', () => {
    render(
      <YouTubeChannelPilotPanel
        workspace={{
          state: 'connected',
          authorizedChannelId: 'UC-owned',
          scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
          lastSyncAt: '2026-09-01T12:00:00.000Z',
          errorMessage: null,
          videos: [
            {
              id: 'video-pk-1',
              channelId: 'UC-owned',
              videoId: 'yt-1',
              title: 'API-backed video',
              url: 'https://youtube.com/watch?v=yt-1',
              publishedAt: '2026-08-31T12:00:00.000Z',
              privacyStatus: 'public',
              thumbnailUrl: 'https://i.ytimg.com/yt-1.jpg',
              lastSyncedAt: '2026-09-01T12:00:00.000Z',
              apiMetrics: {
                window: 'lifetime',
                capturedAt: '2026-09-01T12:00:00.000Z',
                views: 1250,
                watchTimeMinutes: 300,
                avgViewDurationSeconds: 42,
                impressions: null,
                ctr: null,
              },
            },
            {
              id: 'video-pk-2',
              channelId: 'UC-owned',
              videoId: 'yt-2',
              title: 'Snapshot pending video',
              url: 'https://youtube.com/watch?v=yt-2',
              publishedAt: null,
              privacyStatus: 'unlisted',
              thumbnailUrl: null,
              lastSyncedAt: '2026-09-01T12:00:00.000Z',
              apiMetrics: null,
            },
          ],
        }}
      />
    );

    expect(screen.getByText('UC-owned')).toBeInTheDocument();
    expect(screen.getByText('API-backed video')).toBeInTheDocument();
    expect(screen.getByText('Snapshot pending video')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(
      screen.getByText('API snapshot pending — no performance values inferred')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  it('blocks mixed channel ownership instead of rendering a ledger', () => {
    render(
      <YouTubeChannelPilotPanel
        workspace={{
          state: 'ambiguous-channel',
          videos: [],
          errorMessage: 'More than one connected channel.',
        }}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Channel Ownership Is Ambiguous' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Channel Ledger')).not.toBeInTheDocument();
  });
});
