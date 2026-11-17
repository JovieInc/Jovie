import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

const SUGGESTION: OpportunityInboxCardViewModel = {
  id: 'suggestion-1',
  signalType: 'other',
  typeLabel: 'Suggestion',
  createdAt: '2026-08-28T10:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Review pitch',
  status: 'pending',
  category: 'suggestion',
};

const CAPTURE: OpportunityInboxCardViewModel = {
  ...SUGGESTION,
  id: 'capture-1',
  sourceKind: 'jovie.workflow_capture.request',
  typeLabel: 'Workflow',
  title: 'Record a browser workflow',
  primaryActionLabel: 'Record',
  category: 'workflow_capture',
  workflowCapture: {
    instructions: 'Stop before publishing.',
    startUrl: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    state: 'pending',
  },
};

function mount(cards: readonly OpportunityInboxCardViewModel[]) {
  const handlers = {
    onApprove: vi.fn(),
    onDismiss: vi.fn(),
    onOpen: vi.fn(),
    onFeedback: vi.fn(),
    onStackActionInitiated: vi.fn(),
  };
  const view = render(<OpportunityInboxFeed cards={cards} {...handlers} />);
  return { ...view, ...handlers };
}

describe('OpportunityInboxFeed certificate', () => {
  it('approves and dismisses the top stack card, marking the action first', async () => {
    const user = userEvent.setup();
    const { container, onApprove, onDismiss, onStackActionInitiated } = mount([
      SUGGESTION,
    ]);

    await user.click(screen.getByRole('button', { name: 'Review pitch' }));
    expect(onStackActionInitiated).toHaveBeenCalledWith('suggestion-1');
    expect(onApprove).toHaveBeenCalledWith('suggestion-1');
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Opportunity' })
    );
    expect(onDismiss).toHaveBeenCalledWith('suggestion-1');
    await expectNoA11yViolations(container);
  });

  it('opens the top card from the stack control', async () => {
    const user = userEvent.setup();
    const { onOpen } = mount([SUGGESTION]);

    await user.click(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    );
    expect(onOpen).toHaveBeenCalledWith('suggestion-1');
  });

  it('keeps workflow capture cards out of the stack', async () => {
    const { container } = mount([CAPTURE]);

    expect(screen.queryByTestId('opportunity-card-stack')).toBeNull();
    expect(screen.queryByText('Record a browser workflow')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an Arabic card in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OpportunityInboxFeed
          cards={[{ ...SUGGESTION, title: 'احجز حفلة في ديترويت' }]}
          onApprove={vi.fn()}
          onDismiss={vi.fn()}
          onFeedback={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText('احجز حفلة في ديترويت')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
