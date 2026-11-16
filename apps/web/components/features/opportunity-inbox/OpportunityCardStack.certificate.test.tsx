import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityCardStack } from './OpportunityCardStack';

const CARD = {
  id: 'card-1',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-06-28T10:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Review pitch',
  status: 'pending' as const,
  category: 'suggestion' as const,
};
const SECOND = { ...CARD, id: 'card-2', title: 'New single detected' };

function mount(
  props: Partial<Parameters<typeof OpportunityCardStack>[0]> = {}
) {
  const handlers = { onAccept: vi.fn(), onReject: vi.fn(), onOpen: vi.fn() };
  const view = render(
    <OpportunityCardStack cards={[CARD, SECOND]} {...handlers} {...props} />
  );
  return { ...view, ...handlers };
}

describe('OpportunityCardStack certificate', () => {
  it('accepts, dismisses and opens the top card', async () => {
    const user = userEvent.setup();
    const { container, onAccept, onReject, onOpen } = mount();

    await user.click(screen.getByRole('button', { name: 'Review pitch' }));
    expect(onAccept).toHaveBeenCalledWith('card-1');
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Opportunity' })
    );
    expect(onReject).toHaveBeenCalledWith('card-1');
    await user.click(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    );
    expect(onOpen).toHaveBeenCalledWith('card-1');
    expect(screen.getByTestId('opportunity-stack-peek-card-2')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('acts on the top card from the arrow keys', async () => {
    const user = userEvent.setup();
    const { onAccept, onReject } = mount();

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    ).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(onAccept).toHaveBeenCalledWith('card-1');
    await user.keyboard('{ArrowLeft}');
    expect(onReject).toHaveBeenCalledWith('card-1');
  });

  it('renders a single card with no peek stack', async () => {
    const { container } = mount({ cards: [CARD] });

    expect(screen.queryByTestId('opportunity-stack-peek-card-2')).toBeNull();
    expect(screen.getByText(CARD.title)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing with no cards', async () => {
    const { container } = mount({ cards: [] });

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('holds the controls while the top card is pending', async () => {
    const user = userEvent.setup();
    const { container, onAccept } = mount({ pendingActionId: 'card-1' });

    const control = screen.getByRole('button', {
      name: 'Review Current Opportunity',
    });
    expect(control).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review pitch' })).toBeDisabled();
    await user.keyboard('{ArrowRight}');
    expect(onAccept).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps long and Arabic cards axe-clean', async () => {
    const longTitle =
      'Detroit listeners up 340% after the playlist add — book a headline show before the tour routing locks';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OpportunityCardStack
          cards={[
            { ...CARD, title: longTitle },
            { ...SECOND, title: 'تم اكتشاف أغنية جديدة' },
          ]}
          onAccept={vi.fn()}
          onReject={vi.fn()}
          onOpen={vi.fn()}
        />
      </div>
    );

    expect(screen.getAllByText(longTitle).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
