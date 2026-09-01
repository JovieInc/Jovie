import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxYoutubeThumbnailCard } from './OpportunityInboxYoutubeThumbnailCard';

const card = {
  id: 'candidate-1',
  signalType: 'other' as const,
  typeLabel: 'YouTube Thumbnail',
  createdAt: '2026-09-01T12:00:00.000Z',
  title: 'Review thumbnail for A song',
  why: 'Approval records intent; publication remains blocked.',
  primaryActionLabel: 'Approve Candidate',
  status: 'pending' as const,
  category: 'youtube_thumbnail' as const,
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

describe('OpportunityInboxYoutubeThumbnailCard', () => {
  it('renders the control, candidate, API stats, and visible decisions', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <OpportunityInboxYoutubeThumbnailCard
        card={card}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Current live YouTube thumbnail' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Candidate YouTube thumbnail' })
    ).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('300 min')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onApprove).toHaveBeenCalledWith('candidate-1');
    expect(onReject).toHaveBeenCalledWith('candidate-1');
  });
});
