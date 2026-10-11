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

const SOCIAL_REPLY_CARD: OpportunityInboxCardViewModel = {
  id: 'reply-1',
  sourceKind: 'social_reply.draft',
  signalType: 'fan_reply',
  typeLabel: 'Fan Reply',
  createdAt: '2026-09-30T10:00:00.000Z',
  title: 'Reply to Maya on Instagram',
  why: 'Drafted from your saved tone profile.',
  primaryActionLabel: 'Approve Reply',
  status: 'pending',
  category: 'social_reply',
  socialReply: {
    platform: 'Instagram',
    authorLabel: '@maya.wav',
    typeLabel: 'Collab Request',
    inboundText: 'Loved the new track — would you be down to collab?',
    draftedText: 'Thank you so much! Dropping you a DM about collab windows.',
    sourceUrl: 'https://instagram.com/p/abc123',
    executionState: 'pending',
    revisionCount: 0,
  },
};

describe('creator inbox composition', () => {
  it('uses creator decisions without a founder stack or recorder when Inbox Home is on', () => {
    render(
      <OpportunityInboxFeed
        cards={[{ ...SUGGESTION_CARD, sourceKind: undefined }]}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
        enableStackInteractions
      />
    );
    expect(screen.queryByTestId('founder-stack')).not.toBeInTheDocument();
    expect(screen.getByTestId('opportunity-card-stack')).toBeVisible();
    expect(screen.getByText(SUGGESTION_CARD.title)).toBeVisible();
  });
});

describe('OpportunityInboxFeed workflow handoffs', () => {
  it('keeps workflow capture outside the creator decision stack', () => {
    render(
      <OpportunityInboxFeed
        cards={[CAPTURE_CARD, SUGGESTION_CARD]}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
        enableStackInteractions
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Record' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('opportunity-card-stack')).toHaveTextContent(
      SUGGESTION_CARD.title
    );
    expect(screen.getByTestId('opportunity-card-stack')).not.toHaveTextContent(
      CAPTURE_CARD.title
    );
  });

  it('keeps YouTube thumbnail candidates on the creator stack when swipe review is on', () => {
    render(
      <OpportunityInboxFeed
        cards={[YOUTUBE_CARD, SUGGESTION_CARD]}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
        enableStackInteractions
      />
    );

    expect(
      screen.getByTestId('opportunity-inbox-youtube-thumbnail-yt-feed-1')
    ).toBeVisible();
    expect(screen.queryByTestId('founder-stack')).not.toBeInTheDocument();
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

  it.each([false, true])(
    'preserves social reply actions and provenance (stack=%s)',
    async enableStackInteractions => {
      const user = userEvent.setup();
      const onApprove = vi.fn();
      const onDismiss = vi.fn();
      const onRevise = vi.fn();

      render(
        <OpportunityInboxFeed
          enableStackInteractions={enableStackInteractions}
          cards={[SOCIAL_REPLY_CARD]}
          onApprove={onApprove}
          onDismiss={onDismiss}
          onFeedback={vi.fn()}
          onRevise={onRevise}
        />
      );

      expect(
        screen.getByTestId('opportunity-inbox-card-reply-1')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('social-reply-draft-reply-1')
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Approve Reply/ }));
      await user.click(screen.getByRole('button', { name: 'Dismiss' }));
      await user.click(screen.getByRole('button', { name: 'Revise' }));
      await user.type(
        screen.getByLabelText('Revision feedback for Jovie'),
        'Make it warmer'
      );
      await user.click(
        screen.getByRole('button', { name: 'Request revision' })
      );

      expect(onApprove).toHaveBeenCalledWith('reply-1');
      expect(onDismiss).toHaveBeenCalledWith('reply-1');
      expect(onRevise).toHaveBeenCalledWith('reply-1', 'Make it warmer');
      expect(screen.getByLabelText('Revision feedback for Jovie')).toHaveValue(
        'Make it warmer'
      );
    }
  );
});
