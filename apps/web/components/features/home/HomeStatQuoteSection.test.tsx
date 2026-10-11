import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { HomeStatQuoteSection } from './HomeStatQuoteSection';

describe('HomeStatQuoteSection', () => {
  it('renders the stat, supporting copy and source as one heading', () => {
    render(<HomeStatQuoteSection />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Jovie delivers 2.9x');
    expect(heading).toHaveTextContent(
      'faster releases that compound into more fans.'
    );
    expect(
      screen.getByText('Indie release benchmark, 2026')
    ).toBeInTheDocument();
  });

  it('renders caller-provided stat, body and source', () => {
    render(
      <HomeStatQuoteSection
        stat='3x'
        body='more saves.'
        source='Pilot cohort'
      />
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Jovie delivers 3x more saves.'
    );
    expect(screen.getByText('Pilot cohort')).toBeInTheDocument();
  });

  it('binds the Pen stats contract and hides the decorative arcs', () => {
    const { container } = render(<HomeStatQuoteSection />);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.stats
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
