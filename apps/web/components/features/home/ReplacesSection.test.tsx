import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReplacesSection } from './ReplacesSection';

describe('ReplacesSection', () => {
  it('renders bounded replacement copy and the three replaced tools', () => {
    render(<ReplacesSection />);

    expect(screen.getByText('Why switch')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One Tool Instead Of Three.',
      })
    ).toHaveClass('marketing-h2-linear', 'line-clamp-2');
    expect(
      screen.getByText(
        /Most artists juggle a link page, a smart link service, and an email tool/
      )
    ).toHaveClass('marketing-lead-linear', 'text-secondary-token');

    for (const toolName of ['Linktree', 'Linkfire', 'Mailchimp']) {
      expect(screen.getByText(toolName)).toHaveClass('line-through');
    }

    expect(screen.getAllByText('Replaced by Jovie')).toHaveLength(3);
    expect(
      screen.getByText(/or \$0.*\$12\/mo for one that connects everything/)
    ).toHaveClass('text-tertiary-token');
  });
});
