import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

vi.mock('./FounderReviewStack', () => ({
  FounderReviewStack: ({
    cards,
  }: {
    cards: readonly OpportunityInboxCardViewModel[];
  }) => (
    <div data-testid='founder-stack'>
      {cards.map(card => card.id).join(',')}
    </div>
  ),
}));

const CAPTURE_CARD: OpportunityInboxCardViewModel = {
  id: 'capture-1',
  sourceKind: 'jovie.workflow_capture.request',
  signalType: 'other',
  typeLabel: 'Workflow',
  createdAt: '2026-08-28T10:00:00.000Z',
  title: 'Record a browser workflow',
  why: 'Show Jovie the exact steps.',
  primaryActionLabel: 'Record',
  status: 'pending',
  category: 'workflow_capture',
  workflowCapture: {
    instructions: 'Stop before publishing.',
    startUrl: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    state: 'pending',
  },
};

const SUGGESTION_CARD: OpportunityInboxCardViewModel = {
  ...CAPTURE_CARD,
  id: 'suggestion-1',
  typeLabel: 'Suggestion',
  title: 'Review a normal suggestion',
  primaryActionLabel: 'Approve',
  category: 'suggestion',
  workflowCapture: undefined,
};

const YOUTUBE_CARD: OpportunityInboxCardViewModel = {
  id: 'yt-feed-1',
  sourceKind: 'youtube.thumbnail_candidate',
  signalType: 'other',
  typeLabel: 'YouTube Thumbnail',
  createdAt: '2026-09-01T12:00:00.000Z',
  title: 'Review thumbnail for A song',
  why: 'YouTube API snapshot captured 2026-09-01T12:00:00.000Z.',
  primaryActionLabel: 'Approve Candidate',
  status: 'pending',
  category: 'youtube_thumbnail',
  youtubeThumbnail: {
    channelId: 'UC-owned',
    youtubeVideoId: 'video-1',
    currentThumbnailUrl: 'https://i.ytimg.com/current.jpg',
    candidateImageUrl: 'https://cdn.example.com/candidate.jpg',
    artifactSha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    apiMetrics: {
      capturedAt: '2026-09-01T12:00:00.000Z',
      views: 1250,
      watchTimeMinutes: 300,
      avgViewDurationSeconds: 42,
    },
    publicationBlockedReason:
      'direct-thumbnail-mutation-disabled-native-experiment-required',
  },
};

describe('OpportunityInboxFeed workflow handoffs', () => {
  it('keeps Record requests visible and outside the founder decision stack', () => {
    render(
      <OpportunityInboxFeed
        cards={[CAPTURE_CARD, SUGGESTION_CARD]}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
        enableStackInteractions
      />
    );

    expect(screen.getByRole('button', { name: 'Record' })).toBeVisible();
    expect(screen.getByTestId('founder-stack')).toHaveTextContent(
      'suggestion-1'
    );
    expect(screen.getByTestId('founder-stack')).not.toHaveTextContent(
      'capture-1'
    );
  });

  it('keeps YouTube thumbnail candidates on the founder stack when swipe review is on', () => {
    render(
      <OpportunityInboxFeed
        cards={[YOUTUBE_CARD, SUGGESTION_CARD]}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
        enableStackInteractions
      />
    );

    expect(screen.getByTestId('founder-stack')).toHaveTextContent(
      'yt-feed-1,suggestion-1'
    );
  });

  it('renders the YouTube swipe card in the list feed and wires decision actions', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onDismiss = vi.fn();

    render(
      <OpportunityInboxFeed
        cards={[YOUTUBE_CARD]}
        onApprove={onApprove}
        onDismiss={onDismiss}
        onFeedback={vi.fn()}
      />
    );

    expect(
      screen.getByTestId('opportunity-inbox-youtube-thumbnail-yt-feed-1')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve Candidate' })
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }));
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onApprove).toHaveBeenCalledWith('yt-feed-1');
    expect(onDismiss).toHaveBeenCalledWith('yt-feed-1');
  });
});
