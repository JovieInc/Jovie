import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FaqSection } from '@/components/marketing';

const FAQ_ITEMS = [
  {
    question: 'What does Jovie replace?',
    answer: 'It replaces the generic link stack with a music-native profile.',
  },
  {
    question: 'Can I send fans to a specific mode?',
    answer: 'Yes. You can deep-link to music, shows, pay, and more.',
  },
] as const;

describe('FaqSection', () => {
  it('renders the default heading', () => {
    const { container } = render(<FaqSection items={FAQ_ITEMS} />);

    expect(
      screen.getByRole('heading', { name: 'Frequently Asked Questions' })
    ).toBeInTheDocument();
    expect(container.querySelector('.faq-section')).toHaveAttribute(
      'data-pen-contract',
      'pAAhw'
    );
    expect(container.querySelector('.faq-section')).toHaveAttribute(
      'data-layout-contract',
      'bounded-local-disclosure'
    );
  });

  it('removes every closed answer from layout and the accessibility tree', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    for (const item of FAQ_ITEMS) {
      const trigger = screen.getByRole('button', { name: item.question });
      const panel = document.getElementById(
        trigger.getAttribute('aria-controls') ?? ''
      );

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-controls', panel?.id);
      expect(panel).toHaveAttribute('aria-labelledby', trigger.id);
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel).toHaveAttribute('hidden');
      expect(panel).not.toBeVisible();
    }
  });

  it('reveals the selected answer inside the declared disclosure boundary', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    const firstTrigger = screen.getByRole('button', {
      name: FAQ_ITEMS[0].question,
    });
    const firstPanel = document.getElementById(
      firstTrigger.getAttribute('aria-controls') ?? ''
    );

    expect(firstPanel).toHaveTextContent(FAQ_ITEMS[0].answer);
    expect(firstPanel).toHaveAttribute('hidden');
    expect(firstPanel).not.toBeVisible();

    fireEvent.click(firstTrigger);

    expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(firstPanel).toHaveTextContent(FAQ_ITEMS[0].answer);
    expect(firstPanel).not.toHaveAttribute('hidden');
    expect(firstPanel).toHaveAttribute('aria-hidden', 'false');
    expect(firstPanel).toBeVisible();
    expect(screen.getByRole('region', { name: FAQ_ITEMS[0].question })).toBe(
      firstPanel
    );
  });

  it('opens one answer at a time', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    fireEvent.click(
      screen.getByRole('button', { name: FAQ_ITEMS[0].question })
    );
    const firstTrigger = screen.getByRole('button', {
      name: FAQ_ITEMS[0].question,
    });
    const secondTrigger = screen.getByRole('button', {
      name: FAQ_ITEMS[1].question,
    });
    const firstPanel = document.getElementById(
      firstTrigger.getAttribute('aria-controls') ?? ''
    );
    const secondPanel = document.getElementById(
      secondTrigger.getAttribute('aria-controls') ?? ''
    );

    expect(firstPanel).toHaveAttribute('aria-hidden', 'false');
    expect(firstPanel).not.toHaveAttribute('hidden');
    expect(secondPanel).toHaveAttribute('aria-hidden', 'true');
    expect(secondPanel).toHaveAttribute('hidden');

    fireEvent.click(secondTrigger);
    expect(firstPanel).toHaveAttribute('aria-hidden', 'true');
    expect(firstPanel).toHaveAttribute('hidden');
    expect(secondPanel).toHaveAttribute('aria-hidden', 'false');
    expect(secondPanel).not.toHaveAttribute('hidden');
  });

  it('closes an open answer when clicked again', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    const questionButton = screen.getByRole('button', {
      name: FAQ_ITEMS[0].question,
    });

    fireEvent.click(questionButton);
    const panel = document.getElementById(
      questionButton.getAttribute('aria-controls') ?? ''
    );
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panel).not.toHaveAttribute('hidden');

    fireEvent.click(questionButton);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('hidden');
    expect(questionButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports wrapped arrow navigation plus Home and End', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    const firstTrigger = screen.getByRole('button', {
      name: FAQ_ITEMS[0].question,
    });
    const secondTrigger = screen.getByRole('button', {
      name: FAQ_ITEMS[1].question,
    });

    firstTrigger.focus();
    fireEvent.keyDown(firstTrigger, { key: 'ArrowDown' });
    expect(secondTrigger).toHaveFocus();

    fireEvent.keyDown(secondTrigger, { key: 'ArrowDown' });
    expect(firstTrigger).toHaveFocus();

    fireEvent.keyDown(firstTrigger, { key: 'ArrowUp' });
    expect(secondTrigger).toHaveFocus();

    fireEvent.keyDown(secondTrigger, { key: 'Home' });
    expect(firstTrigger).toHaveFocus();

    fireEvent.keyDown(firstTrigger, { key: 'End' });
    expect(secondTrigger).toHaveFocus();
  });

  it('keeps native Enter and Space disclosure controls', async () => {
    const user = userEvent.setup();
    render(<FaqSection items={FAQ_ITEMS} />);

    const firstTrigger = screen.getByRole('button', {
      name: FAQ_ITEMS[0].question,
    });
    firstTrigger.focus();

    await user.keyboard('{Enter}');
    expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard(' ');
    expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses a custom heading when provided', () => {
    render(<FaqSection items={FAQ_ITEMS} heading='Support Questions' />);

    expect(
      screen.getByRole('heading', { name: 'Support Questions' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Frequently Asked Questions' })
    ).not.toBeInTheDocument();
  });
});
