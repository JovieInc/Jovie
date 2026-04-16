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

    expect(screen.getByText(FAQ_ITEMS[0].answer)).not.toBeVisible();
    expect(screen.getByText(FAQ_ITEMS[1].answer)).not.toBeVisible();
    expect(
      screen.getByRole('button', { name: FAQ_ITEMS[0].question })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: FAQ_ITEMS[1].question })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens one answer at a time', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    fireEvent.click(
      screen.getByRole('button', { name: FAQ_ITEMS[0].question })
    );
    expect(screen.getByText(FAQ_ITEMS[0].answer)).toBeVisible();
    expect(screen.getByText(FAQ_ITEMS[1].answer)).not.toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: FAQ_ITEMS[1].question })
    );
    expect(screen.getByText(FAQ_ITEMS[0].answer)).not.toBeVisible();
    expect(screen.getByText(FAQ_ITEMS[1].answer)).toBeVisible();
  });

  it('closes an open answer when clicked again', () => {
    render(<FaqSection items={FAQ_ITEMS} />);

    const questionButton = screen.getByRole('button', {
      name: FAQ_ITEMS[0].question,
    });

    fireEvent.click(questionButton);
    expect(screen.getByText(FAQ_ITEMS[0].answer)).toBeVisible();

    fireEvent.click(questionButton);
    expect(screen.getByText(FAQ_ITEMS[0].answer)).not.toBeVisible();
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
