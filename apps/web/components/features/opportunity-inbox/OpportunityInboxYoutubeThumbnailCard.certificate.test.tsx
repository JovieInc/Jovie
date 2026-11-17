import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityInboxYoutubeThumbnailCard } from './OpportunityInboxYoutubeThumbnailCard';

const youtubeThumbnail = {
  channelId: 'UC90tJdD38139ytPUdEZVl1A',
  youtubeVideoId: 'video-1',
  currentThumbnailUrl: 'https://i.ytimg.com/vi/current/maxresdefault.jpg',
  candidateImageUrl: 'https://i.ytimg.com/vi/candidate/maxresdefault.jpg',
  artifactSha256:
    'aab81dd7f28d4421478c03e4d0d62a58ef13db556c4c52beacf56f24f782ba01',
  apiMetrics: {
    capturedAt: '2026-09-01T12:00:00.000Z',
    views: 128_450,
    watchTimeMinutes: 438_900,
    avgViewDurationSeconds: 205,
  },
  publicationBlockedReason:
    'direct-thumbnail-mutation-disabled-native-experiment-required',
} as const;

const card = {
  id: 'candidate-1',
  signalType: 'other',
  typeLabel: 'YouTube Thumbnail',
  createdAt: '2026-09-01T12:00:00.000Z',
  title: 'Review thumbnail for The Last Time',
  why: 'YouTube API snapshot captured Sep 1, 2026.',
  primaryActionLabel: 'Approve Candidate',
  status: 'pending',
  category: 'youtube_thumbnail',
  youtubeThumbnail,
} as OpportunityInboxCardViewModel;

describe('OpportunityInboxYoutubeThumbnailCard certificate', () => {
  it('approves and rejects the candidate by id', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <OpportunityInboxYoutubeThumbnailCard
        card={card}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }));
    expect(onApprove).toHaveBeenCalledWith('candidate-1');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledWith('candidate-1');
    expect(
      screen.getByRole('img', { name: 'Current live YouTube thumbnail' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('holds both actions while saving', async () => {
    const { container } = render(
      <OpportunityInboxYoutubeThumbnailCard
        card={card}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        isBusy
      />
    );

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('renders nothing without a candidate', async () => {
    const { container } = render(
      <OpportunityInboxYoutubeThumbnailCard
        card={{ ...card, youtubeThumbnail: undefined }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('marks missing control and metrics as unavailable', async () => {
    const { container } = render(
      <OpportunityInboxYoutubeThumbnailCard
        card={{
          ...card,
          youtubeThumbnail: {
            ...youtubeThumbnail,
            currentThumbnailUrl: null,
            apiMetrics: {
              ...youtubeThumbnail.apiMetrics,
              watchTimeMinutes: null,
              avgViewDurationSeconds: null,
            },
          },
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText('Control unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps a long and an Arabic title axe-clean', async () => {
    const longTitle =
      'Review the refreshed thumbnail for The Last Time (Official Music Video, Extended Sunrise Mix featuring the Whole Band)';
    const { container, rerender } = render(
      <OpportunityInboxYoutubeThumbnailCard
        card={{ ...card, title: longTitle }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(
      screen.getByRole('heading', { name: longTitle })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <OpportunityInboxYoutubeThumbnailCard
          card={{ ...card, title: 'راجع الصورة المصغرة' }}
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      </div>
    );
    expect(
      screen.getByRole('heading', { name: 'راجع الصورة المصغرة' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
