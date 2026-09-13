import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';

type RecorderProps = {
  readonly target: {
    readonly type: string;
    readonly id: string;
    readonly title: string;
    readonly sourceKind: string;
    readonly category: string;
  };
  readonly className?: string;
};

type StackProps = {
  readonly cards: OpportunityInboxCardViewModel[];
  readonly onApprove: (id: string) => void | Promise<void>;
  readonly onReject: (id: string) => void | Promise<void>;
  readonly onOpen?: (id: string) => void;
};

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useMutations: vi.fn(),
  recorder: vi.fn<(props: RecorderProps) => ReactNode>(() => (
    <div data-testid='founder-review-recorder' />
  )),
  stack: vi.fn<(props: StackProps) => ReactNode>(({ cards }) => (
    <div data-testid='founder-review-stack' data-card-count={cards.length} />
  )),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock(
  '@/components/features/opportunity-inbox/FounderReviewRecorder',
  () => ({
    FounderReviewRecorder: mocks.recorder,
  })
);
vi.mock('@/components/features/opportunity-inbox/FounderReviewStack', () => ({
  FounderReviewStack: mocks.stack,
}));
vi.mock('@/lib/queries/useOpportunityInboxMutations', () => ({
  useOpportunityInboxMutations: mocks.useMutations,
}));

import { OvieFounderReviewSurface } from './OvieFounderReviewSurface';

const CARD = {
  id: 'card-1',
  sourceKind: 'test.suggestion',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Review this signal',
  why: 'It is worth a founder decision.',
  primaryActionLabel: 'Approve',
  status: 'pending' as const,
  category: 'suggestion' as const,
} satisfies OpportunityInboxCardViewModel;

const WORKFLOW_CARD = {
  ...CARD,
  id: 'workflow-1',
  category: 'workflow_capture' as const,
};

function mutation() {
  return { isPending: false, variables: undefined, mutateAsync: vi.fn() };
}

describe('OvieFounderReviewSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useMutations.mockReturnValue({
      approveMutation: mutation(),
      dismissMutation: mutation(),
      nextStepMutation: mutation(),
    });
  });

  it('keeps the recorder reachable when the Ovie queue is empty', () => {
    render(<OvieFounderReviewSurface cards={[]} />);

    expect(screen.getByTestId('ovie-founder-review-entry')).toBeInTheDocument();
    expect(screen.getByTestId('founder-review-recorder')).toBeInTheDocument();
    expect(mocks.recorder.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        target: expect.objectContaining({
          type: 'founder-note',
          id: 'founder-brain-dump',
          sourceKind: 'founder.brain_dump',
          category: 'note',
        }),
      })
    );
    expect(
      screen.queryByTestId('founder-review-stack')
    ).not.toBeInTheDocument();
  });

  it('shows queue load failure separately from an empty queue', () => {
    render(<OvieFounderReviewSurface cards={[]} loadError />);

    expect(
      screen.getByTestId('ovie-founder-review-load-error')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No pending inbox opportunities/i)
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('founder-review-recorder')).toBeInTheDocument();
  });

  it('mounts the founder stack only for source-bound non-workflow cards', () => {
    render(
      <OvieFounderReviewSurface
        cards={[
          CARD,
          WORKFLOW_CARD,
          { ...CARD, id: 'missing-source', sourceKind: undefined },
        ]}
      />
    );

    expect(screen.getByTestId('founder-review-stack')).toHaveAttribute(
      'data-card-count',
      '1'
    );
    expect(screen.getByTestId('founder-review-recorder')).toBeInTheDocument();
  });

  it('keeps stack decisions on the canonical opportunity mutation path', async () => {
    const approve = mutation();
    mocks.useMutations.mockReturnValue({
      approveMutation: approve,
      dismissMutation: mutation(),
      nextStepMutation: mutation(),
    });

    render(<OvieFounderReviewSurface cards={[CARD]} />);

    const stackProps = mocks.stack.mock.calls[0]?.[0];
    if (!stackProps) throw new Error('Founder stack props were not captured');
    await stackProps.onApprove('card-1');

    expect(approve.mutateAsync).toHaveBeenCalledWith('card-1');
  });

  it('keeps opportunity deep links in the authorized Ovie chat route', () => {
    render(<OvieFounderReviewSurface cards={[CARD]} />);

    const stackProps = mocks.stack.mock.calls[0]?.[0];
    if (!stackProps) throw new Error('Founder stack props were not captured');
    stackProps.onOpen?.('card-1');

    expect(mocks.push).toHaveBeenCalledWith(
      `${APP_ROUTES.ADMIN_CHAT}?opportunityId=card-1`
    );
  });

  it('routes report approval through the canonical next-step mutation', async () => {
    const nextStep = mutation();
    const reportCard = { ...CARD, id: 'report-1', category: 'report' as const };
    mocks.useMutations.mockReturnValue({
      approveMutation: mutation(),
      dismissMutation: mutation(),
      nextStepMutation: nextStep,
    });

    render(<OvieFounderReviewSurface cards={[reportCard]} />);

    const stackProps = mocks.stack.mock.calls[0]?.[0];
    if (!stackProps) throw new Error('Founder stack props were not captured');
    await act(async () => {
      await stackProps.onApprove('report-1');
    });

    expect(nextStep.mutateAsync).toHaveBeenCalledWith('report-1');
  });

  it('routes rejection through the canonical dismiss mutation', async () => {
    const dismiss = mutation();
    mocks.useMutations.mockReturnValue({
      approveMutation: mutation(),
      dismissMutation: dismiss,
      nextStepMutation: mutation(),
    });

    render(<OvieFounderReviewSurface cards={[CARD]} />);

    const stackProps = mocks.stack.mock.calls[0]?.[0];
    if (!stackProps) throw new Error('Founder stack props were not captured');
    await act(async () => {
      await stackProps.onReject('card-1');
    });

    expect(dismiss.mutateAsync).toHaveBeenCalledWith('card-1');
  });

  it('restores a card and propagates a failed canonical action', async () => {
    const approve = mutation();
    approve.mutateAsync.mockRejectedValue(new Error('action failed'));
    mocks.useMutations.mockReturnValue({
      approveMutation: approve,
      dismissMutation: mutation(),
      nextStepMutation: mutation(),
    });

    render(<OvieFounderReviewSurface cards={[CARD]} />);

    const stackProps = mocks.stack.mock.calls[0]?.[0];
    if (!stackProps) throw new Error('Founder stack props were not captured');
    await act(async () => {
      await expect(stackProps.onApprove('card-1')).rejects.toThrow(
        'action failed'
      );
    });

    expect(screen.getByTestId('founder-review-stack')).toHaveAttribute(
      'data-card-count',
      '1'
    );
  });
});
