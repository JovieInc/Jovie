import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type HomepageOpportunityItem,
  HomepageOpportunitySection,
} from '@/components/homepage/HomepageOpportunitySection';

const opportunities: readonly HomepageOpportunityItem[] = [
  {
    title: 'Underexposed releases.',
    body: 'Songs gaining momentum that have no presave page or fan capture set up.',
  },
  {
    title: 'Uncaptured moments.',
    body: 'Streams that arrive without a way for listeners to follow, subscribe, or save the next drop.',
  },
  {
    title: 'Playlist openings.',
    body: 'Editorial and curator playlists adding artists with your sound.',
  },
];

describe('HomepageOpportunitySection', () => {
  it('renders the consolidated opportunity story as one cardless semantic section', () => {
    render(
      <HomepageOpportunitySection
        headline='Your always-on AI artist manager.'
        description='Jovie finds the next opportunity in your catalog.'
        opportunities={opportunities}
      />
    );

    expect(
      screen.getByRole('region', {
        name: 'Your always-on AI artist manager.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Your always-on AI artist manager.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-opportunity-description')
    ).toHaveTextContent('Jovie finds the next opportunity in your catalog.');
    expect(screen.getAllByTestId('homepage-opportunity-item')).toHaveLength(3);

    for (const opportunity of opportunities) {
      expect(
        screen.getByRole('heading', { level: 3, name: opportunity.title })
      ).toBeInTheDocument();
      expect(screen.getByText(opportunity.body)).toBeInTheDocument();
    }
  });

  it('keeps the demo slot stable and renders an optional composer proof', () => {
    const { rerender } = render(
      <HomepageOpportunitySection
        headline='Your always-on AI artist manager.'
        description='Jovie finds the next opportunity.'
        opportunities={opportunities}
      />
    );

    expect(screen.getByTestId('homepage-opportunity-demo')).toBeInTheDocument();

    rerender(
      <HomepageOpportunitySection
        headline='Your always-on AI artist manager.'
        description='Jovie finds the next opportunity.'
        opportunities={opportunities}
        demo={<div>Composer proof</div>}
      />
    );

    expect(screen.getByTestId('homepage-opportunity-demo')).toHaveTextContent(
      'Composer proof'
    );
  });
});
