import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ValuePropsSection } from './ValuePropsSection';

describe('ValuePropsSection', () => {
  it('renders bounded value-prop copy and three feature cards', () => {
    render(<ValuePropsSection />);

    expect(screen.getByText('Why artists switch')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Built for releases, not just links.',
      })
    ).toHaveClass('marketing-h2-linear', 'line-clamp-2');
    expect(
      screen.getByText(
        'Jovie brings your profile, release workflow, and follow-up into one launch surface.'
      )
    ).toHaveClass('marketing-lead-linear', 'text-secondary-token');

    for (const cardTitle of [
      'Built for artists',
      'Automated releases',
      'Fan intelligence',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: cardTitle })
      ).toBeInTheDocument();
    }
  });
});
