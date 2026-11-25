import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TestimonialCard } from './TestimonialCard';

const props = {
  name: 'Tim White',
  title: 'Artist',
  quote: 'Jovie keeps the release work in one place.',
  initials: 'TW',
};

describe('TestimonialCard', () => {
  it('renders the quote, name, title and initials axe-clean', async () => {
    const { container } = render(<TestimonialCard {...props} />);
    expect(screen.getByText(/keeps the release work/)).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('TW')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a long quote without truncating it', async () => {
    const quote = 'A very long quote. '.repeat(20).trim();
    const { container } = render(<TestimonialCard {...props} quote={quote} />);
    expect(screen.getByRole('blockquote', { hidden: true })).toHaveTextContent(
      'A very long quote.'
    );
    await expectNoA11yViolations(container);
  });
});
