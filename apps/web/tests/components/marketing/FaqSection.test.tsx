import { fireEvent, render, screen } from '@testing-library/react';
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
    render(<FaqSection items={FAQ_ITEMS} />);

    expect(
      screen.getByRole('heading', { name: 'Frequently Asked Questions' })
    ).toBeInTheDocument();
  });

  it('keeps all answers collapsed on initial render', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    for (const item of FAQ_ITEMS) {
      const trigger = screen.getByRole('button', { name: item.question });
      const panel = document.getElementById(
        trigger.getAttribute('aria-controls') ?? ''
      );

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel).toHaveClass('invisible');
    }
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
    expect(firstPanel).toHaveClass('visible');
    expect(secondPanel).toHaveAttribute('aria-hidden', 'true');
    expect(secondPanel).toHaveClass('invisible');

    fireEvent.click(secondTrigger);
    expect(firstPanel).toHaveAttribute('aria-hidden', 'true');
    expect(firstPanel).toHaveClass('invisible');
    expect(secondPanel).toHaveAttribute('aria-hidden', 'false');
    expect(secondPanel).toHaveClass('visible');
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
    expect(panel).toHaveClass('visible');

    fireEvent.click(questionButton);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveClass('invisible');
    expect(questionButton).toHaveAttribute('aria-expanded', 'false');
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
