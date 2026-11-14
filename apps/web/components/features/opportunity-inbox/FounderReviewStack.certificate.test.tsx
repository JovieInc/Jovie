import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FounderReviewStack } from './FounderReviewStack';

const hoisted = vi.hoisted(() => ({ listReceipts: vi.fn() }));

vi.mock('@/lib/founder-review/client', () => ({
  createFounderReviewClient: vi.fn(),
  listFounderReviewReceipts: hoisted.listReceipts,
  deleteFounderReviewAudio: vi.fn(),
  uploadFounderReviewAudio: vi.fn(),
  updateFounderReviewActionOutcome: vi.fn(),
}));

type StackCard = OpportunityInboxCardViewModel & {
  readonly sourceKind: string;
};

const CARD = {
  id: 'card-1',
  sourceKind: 'test.suggestion',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Approve',
  status: 'pending' as const,
  category: 'suggestion' as const,
} satisfies StackCard;

const YOUTUBE_CARD = {
  ...CARD,
  id: 'yt-1',
  sourceKind: 'youtube.thumbnail_candidate',
  typeLabel: 'YouTube Thumbnail',
  title: 'Review thumbnail for The Last Time',
  primaryActionLabel: 'Approve Candidate',
  category: 'youtube_thumbnail',
  youtubeThumbnail: {
    channelId: 'UC90tJdD38139ytPUdEZVl1A',
    youtubeVideoId: 'video-1',
    currentThumbnailUrl: 'https://i.ytimg.com/vi/current/maxresdefault.jpg',
    candidateImageUrl: 'https://i.ytimg.com/vi/candidate/maxresdefault.jpg',
    artifactSha256: 'a'.repeat(64),
    apiMetrics: {
      capturedAt: '2026-09-01T12:00:00.000Z',
      views: 128_450,
      watchTimeMinutes: 438_900,
      avgViewDurationSeconds: 205,
    },
    publicationBlockedReason:
      'direct-thumbnail-mutation-disabled-native-experiment-required',
  },
} as StackCard;

function mount(
  overrides: Partial<Parameters<typeof FounderReviewStack>[0]> = {}
) {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  const onOpen = vi.fn();
  const view = render(
    <FounderReviewStack
      cards={[CARD]}
      onApprove={onApprove}
      onReject={onReject}
      onOpen={onOpen}
      {...overrides}
    />
  );
  return { ...view, onApprove, onReject, onOpen };
}

describe('FounderReviewStack certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listReceipts.mockResolvedValue([]);
  });

  it('opens the current card from the review control', async () => {
    const user = userEvent.setup();
    const { container, onOpen } = mount();

    await user.click(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    );

    expect(onOpen).toHaveBeenCalledWith('card-1');
    expect(screen.getByText('Source visual not available')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('approves and rejects a YouTube thumbnail with the arrow keys', async () => {
    const user = userEvent.setup();
    const { container, onApprove, onReject } = mount({ cards: [YOUTUBE_CARD] });

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    ).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(onApprove).toHaveBeenCalledWith('yt-1');
    await user.keyboard('{ArrowLeft}');
    expect(onReject).toHaveBeenCalledWith('yt-1');
    await expectNoA11yViolations(container);
  });

  it('ignores modified arrow keys and keys while the card is pending', async () => {
    const user = userEvent.setup();
    const { onApprove, rerender, onReject } = mount({ cards: [YOUTUBE_CARD] });

    await user.tab();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onApprove).not.toHaveBeenCalled();

    rerender(
      <FounderReviewStack
        cards={[YOUTUBE_CARD]}
        onApprove={onApprove}
        onReject={onReject}
        pendingActionId='yt-1'
      />
    );
    expect(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    ).toBeDisabled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('renders nothing for an empty queue', async () => {
    const { container } = mount({ cards: [] });

    expect(screen.queryByTestId('founder-review-stack')).toBeNull();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('counts a long queue and truncates a long title', async () => {
    const longTitle =
      'Detroit listeners up 340% after the playlist add — book a headline show before the tour routing locks';
    const { container } = mount({
      cards: Array.from({ length: 12 }, (_, index) => ({
        ...CARD,
        id: `card-${index + 1}`,
        title: longTitle,
      })),
    });

    expect(screen.getByText('1 of 12')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: longTitle })).toHaveClass(
      'truncate'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an Arabic card in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FounderReviewStack
          cards={[
            { ...CARD, title: 'المستمعون في ديترويت ارتفعوا — احجز حفلة' },
          ]}
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', {
        name: 'المستمعون في ديترويت ارتفعوا — احجز حفلة',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
