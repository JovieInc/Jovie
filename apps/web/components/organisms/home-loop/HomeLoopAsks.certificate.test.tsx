import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HomeLoopAsk } from '@/lib/home-loop/contract';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeLoopAsks, HomeLoopAsksSkeleton } from './HomeLoopAsks';

const ask: HomeLoopAsk = {
  id: 'ask-1',
  title: 'Hero',
  recommendation: 'Review the evidence and certify or request changes.',
  why: 'Marketing hero',
  decidable: true,
  actionLabel: 'Certify',
  canReply: true,
  evidence: ['https://example.test/a'],
  requiresEvidence: true,
  evidenceSummary: 'Screens attached',
  decisionDefault: null,
  canFeedback: false,
};

function Harness({ onReply }: { onReply: () => void }) {
  return (
    <HomeLoopAsks
      asks={[ask]}
      answers={{}}
      onApprove={vi.fn()}
      onReply={onReply}
    />
  );
}

describe('HomeLoopAsks certificate', () => {
  it('keeps typed reply text and focus through a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    const { rerender } = render(<Harness onReply={onReply} />);
    const input = screen.getByRole('textbox', { name: 'Reply: Hero' });

    await user.type(input, 'Needs a tighter crop');
    rerender(<Harness onReply={onReply} />);
    expect(input).toHaveValue('Needs a tighter crop');
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Needs a tighter crop');
    await user.tab();
    expect(input).toHaveValue('Needs a tighter crop');
  });

  it('sends the reply, clears the field and has no axe violations', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    const { container } = render(<Harness onReply={onReply} />);
    const card = screen.getByTestId('home-loop-ask');

    await expectNoA11yViolations(container);
    await user.type(
      within(card).getByRole('textbox', { name: 'Reply: Hero' }),
      'Looks good{Enter}'
    );
    expect(onReply).toHaveBeenCalledWith(ask, 'Looks good');
    expect(
      within(card).getByRole('textbox', { name: 'Reply: Hero' })
    ).toHaveValue('');
  });

  it('opens the Why details and has no axe violations in the empty and loading states', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness onReply={vi.fn()} />);
    const why = screen.getByRole('button', { name: 'Why' });
    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    unmount();

    const empty = render(
      <HomeLoopAsks
        asks={[]}
        answers={{}}
        onApprove={vi.fn()}
        onReply={vi.fn()}
      />
    );
    await expectNoA11yViolations(empty.container);
    empty.unmount();
    const loading = render(<HomeLoopAsksSkeleton />);
    await expectNoA11yViolations(loading.container);
  });
});
