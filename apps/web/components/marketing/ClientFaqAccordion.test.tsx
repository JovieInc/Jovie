import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));

import { ClientFaqAccordion } from './ClientFaqAccordion';

const items = [
  { question: 'Is it free?', answer: 'Yes, to start.' },
  { question: 'Can I import?', answer: 'Yes.' },
  { question: 'Is it fast?', answer: 'Very.' },
];

describe('ClientFaqAccordion', () => {
  beforeEach(() => track.mockClear());

  it('renders no triggers for an empty list', async () => {
    const { container } = render(<ClientFaqAccordion items={[]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens and closes an answer and tracks only opens', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClientFaqAccordion
        items={items}
        analyticsEventName='faq_open'
        analyticsProperties={{ page: 'home' }}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Is it free?' });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Yes, to start.')).toBeVisible();
    expect(track).toHaveBeenCalledWith('faq_open', {
      page: 'home',
      question: 'Is it free?',
      index: 0,
    });
    await expectNoA11yViolations(container);

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('moves focus between triggers with arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<ClientFaqAccordion items={items} />);
    const [first, second, third] = screen.getAllByRole('button');

    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{End}');
    expect(third).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(third).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
  });
});
