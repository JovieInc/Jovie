import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { YouTubeChannelPilotPanel } from './YouTubeChannelPilotPanel';

const connected = {
  state: 'connected',
  authorizedChannelId: 'UC-owned',
  scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  lastSyncAt: null,
  errorMessage: null,
} as const;

describe('YouTubeChannelPilotPanel certificate', () => {
  it('keeps the auth-required state axe-clean and its link focusable', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <YouTubeChannelPilotPanel
        workspace={{ state: 'auth-required', videos: [], errorMessage: null }}
      />
    );

    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Review Candidates in Inbox' })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders the awaiting-sync state without forced capitals', () => {
    render(
      <YouTubeChannelPilotPanel workspace={{ ...connected, videos: [] }} />
    );

    const label = screen.getByText('Authorized Channel');
    expect(label.className).not.toMatch(/\buppercase\b/);
    expect(screen.getByTestId('youtube-channel-awaiting-sync')).toBeVisible();
  });

  it('keeps the ledger axe-clean and the video link opens in a new tab', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <YouTubeChannelPilotPanel
        workspace={{
          ...connected,
          lastSyncAt: '2026-09-01T12:00:00.000Z',
          videos: [
            {
              id: 'video-pk-1',
              channelId: 'UC-owned',
              videoId: 'yt-1',
              title: 'API-backed video',
              url: 'https://youtube.com/watch?v=yt-1',
              publishedAt: '2026-08-31T12:00:00.000Z',
              privacyStatus: 'public',
              thumbnailUrl: null,
              lastSyncedAt: '2026-09-01T12:00:00.000Z',
              apiMetrics: null,
            },
          ],
        }}
      />
    );

    const link = screen.getByRole('link', { name: 'API-backed video' });
    await user.hover(link);
    expect(link).toHaveAttribute('target', '_blank');
    await expectNoA11yViolations(container);
  });

  it('keeps the ambiguous-channel state axe-clean', async () => {
    const { container } = render(
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
    await expectNoA11yViolations(container);
  });
});
