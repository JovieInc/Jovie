import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DecisionCard, type DecisionCardStatus } from './DecisionCard';
import { DECISION_CARD_STORY_STATES, LAYOUT_VIEW } from './fixtures';

function mount(
  props: Partial<Parameters<typeof DecisionCard>[0]> & {
    readonly status?: DecisionCardStatus;
  } = {}
) {
  const handlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(
    <DecisionCard
      view={LAYOUT_VIEW}
      status={{ kind: 'pending' }}
      discussHref='/app/ov/chat?discuss=summer-card%3Asc_1'
      {...handlers}
      {...props}
    />
  );
  return { ...view, ...handlers };
}

describe('DecisionCard certificate', () => {
  it.each(Object.entries(DECISION_CARD_STORY_STATES))(
    'keeps the %s story state axe-clean',
    async (_name, args) => {
      const { container } = mount(args);
      expect(screen.getByRole('article')).toHaveAttribute(
        'data-status',
        args.status.kind
      );
      await expectNoA11yViolations(container);
    }
  );

  it('approves and rejects through the visible buttons', async () => {
    const user = userEvent.setup();
    const { onApprove, onReject } = mount();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('approves with ArrowRight and rejects with ArrowLeft on a focused button', async () => {
    const user = userEvent.setup();
    const { onApprove, onReject } = mount();
    screen.getByRole('button', { name: 'Approve' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowLeft}');
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('retries a failed write', async () => {
    const user = userEvent.setup();
    const { onRetry, container } = mount({
      status: { kind: 'error', message: 'Offline. Not recorded. Retry.' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Offline. Not recorded. Retry.'
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps an empty decision and a no-reject source axe-clean', async () => {
    const { container } = mount({
      view: {
        ...LAYOUT_VIEW,
        fallback: null,
        waiting: { hours: 26, level: 1 },
        facts: [],
        evidence: [],
      },
      onReject: undefined,
      approveLabel: 'Ship It',
    });
    expect(screen.queryByTestId('decision-card-facts')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.getByText('Waiting 26h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ship It' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('locks both buttons while submitting', async () => {
    const { container } = mount({
      status: { kind: 'submitting', decision: 'approve' },
    });
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy in an RTL document axe-clean', async () => {
    const decision =
      'Put the open asks above the pulse on Ovie Home and move the shipping strip under the fold for every founder account';
    const { container } = render(
      <div dir='rtl'>
        <DecisionCard
          view={{ ...LAYOUT_VIEW, decision }}
          status={{ kind: 'pending' }}
          discussHref='/app/ov/chat'
          onApprove={vi.fn()}
        />
      </div>
    );
    expect(screen.getByRole('article', { name: decision })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
