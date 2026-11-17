import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FaqSection } from './FaqSection';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

const items = [
  { question: 'What does Jovie keep moving?', answer: 'Your profile.' },
  { question: 'Can I start with an existing profile?', answer: 'Yes.' },
  { question: 'What happens on release day?', answer: 'It leads.' },
];

describe('FaqSection certificate', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it('renders the default heading and closed questions axe-clean', async () => {
    const { container } = render(<FaqSection items={items} />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Frequently Asked Questions',
      })
    ).toBeInTheDocument();
    for (const item of items) {
      expect(
        screen.getByRole('button', { name: item.question })
      ).toHaveAttribute('aria-expanded', 'false');
    }
    expect(container.querySelector('section')).not.toHaveAttribute(
      'data-testid'
    );
    await expectNoA11yViolations(container);
  });

  it('opens one answer at a time and tracks the opened question', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FaqSection
        items={items}
        sectionVariant='structured-data-list'
        heading='Questions'
        analyticsEventName='faq_opened'
        analyticsProperties={{ source: 'home' }}
      />
    );
    const first = screen.getByRole('button', { name: items[0]!.question });
    const second = screen.getByRole('button', { name: items[1]!.question });

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');

    expect(track).toHaveBeenNthCalledWith(1, 'faq_opened', {
      source: 'home',
      question: items[0]!.question,
      index: 0,
    });
    expect(track).toHaveBeenNthCalledWith(2, 'faq_opened', {
      source: 'home',
      question: items[1]!.question,
      index: 1,
    });
    expect(screen.getByTestId('marketing-section-faq')).toHaveAttribute(
      'data-marketing-variant',
      'structured-data-list'
    );
    await expectNoA11yViolations(container);
  });

  it('moves focus between questions with the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<FaqSection items={items} />);
    const [first, second, third] = screen.getAllByRole('button');

    first!.focus();
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
    expect(track).not.toHaveBeenCalled();
  });

  it('renders an empty list and right-to-left questions axe-clean', async () => {
    const empty = render(<FaqSection items={[]} heading='Questions' />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <FaqSection
          heading='الأسئلة الشائعة'
          items={[{ question: 'هل يمكنني البدء؟', answer: 'نعم.' }]}
        />
      </div>
    );
    expect(
      screen.getByRole('button', { name: 'هل يمكنني البدء؟' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
