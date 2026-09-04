import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingSectionIntro } from './MarketingSectionIntro';

describe('MarketingSectionIntro', () => {
  it('renders bounded intro copy with optional badges and aside', () => {
    render(
      <MarketingSectionIntro
        eyebrow='Inside Jovie'
        title='Your release work, connected.'
        titleId='release-work-title'
        titleClassName='intro-title'
        description='Shared release and fan activity.'
        descriptionClassName='intro-description'
        className='intro-frame'
        copyClassName='intro-copy'
        aside={<p>Capture intent before release day.</p>}
        asideClassName='intro-aside'
        badges={[{ label: 'Presaves', testId: 'intro-badge-presaves' }]}
      />
    );

    const title = screen.getByRole('heading', {
      level: 2,
      name: 'Your release work, connected.',
    });
    expect(title).toHaveAttribute('id', 'release-work-title');
    expect(title).toHaveClass(
      'marketing-h2-linear',
      'line-clamp-2',
      'intro-title'
    );
    expect(screen.getByText('Inside Jovie')).toHaveClass(
      'homepage-section-eyebrow'
    );
    expect(screen.getByText('Shared release and fan activity.')).toHaveClass(
      'intro-description'
    );
    expect(title.parentElement).toHaveClass(
      'homepage-section-copy',
      'intro-copy'
    );
    expect(title.parentElement?.parentElement).toHaveClass(
      'homepage-section-intro',
      'intro-frame'
    );
    expect(screen.getByTestId('intro-badge-presaves')).toHaveTextContent(
      'Presaves'
    );
    expect(
      screen.getByText('Capture intent before release day.').parentElement
    ).toHaveClass('intro-aside');
  });

  it('omits badge chrome when labels are empty', () => {
    render(
      <MarketingSectionIntro
        eyebrow='The platform'
        title='One profile for every fan.'
        description='Show the next useful release or action.'
        badges={[]}
      />
    );

    expect(screen.queryByText('Presaves')).not.toBeInTheDocument();
  });
});
