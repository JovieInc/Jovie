import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingSectionIntro } from './MarketingSectionIntro';

describe('MarketingSectionIntro', () => {
  it('renders eyebrow, title, and description without optional chrome', () => {
    render(
      <MarketingSectionIntro
        eyebrow='Inside Jovie'
        title='Your release work, connected.'
        titleId='release-work-title'
        titleClassName='intro-title'
        description='A shared view of releases, profiles, and fan activity.'
        descriptionClassName='intro-description'
        className='intro-frame'
        copyClassName='intro-copy'
      />
    );

    const title = screen.getByRole('heading', {
      level: 2,
      name: 'Your release work, connected.',
    });
    expect(title).toHaveAttribute('id', 'release-work-title');
    expect(title).toHaveClass('marketing-h2-linear', 'intro-title');
    expect(screen.getByText('Inside Jovie')).toHaveClass(
      'homepage-section-eyebrow'
    );
    expect(
      screen.getByText('A shared view of releases, profiles, and fan activity.')
    ).toHaveClass('intro-description');
    expect(title.parentElement).toHaveClass(
      'homepage-section-copy',
      'intro-copy'
    );
    expect(title.parentElement?.parentElement).toHaveClass(
      'homepage-section-intro',
      'intro-frame'
    );
    expect(screen.queryByText('Presaves')).not.toBeInTheDocument();
  });

  it('renders badges only when the list has labels', () => {
    const { rerender } = render(
      <MarketingSectionIntro
        eyebrow='The platform'
        title='One profile for every fan.'
        description='Show the next useful release or action.'
        badges={[]}
      />
    );

    expect(screen.queryByText('Presaves')).not.toBeInTheDocument();

    rerender(
      <MarketingSectionIntro
        eyebrow='The platform'
        title='One profile for every fan.'
        description='Show the next useful release or action.'
        badges={[
          { label: 'Presaves', testId: 'intro-badge-presaves' },
          { label: 'Release day' },
        ]}
      />
    );

    expect(screen.getByTestId('intro-badge-presaves')).toHaveTextContent(
      'Presaves'
    );
    expect(screen.getByText('Release day')).toBeInTheDocument();
  });

  it('renders an aside next to the section copy', () => {
    render(
      <MarketingSectionIntro
        eyebrow='Fan intelligence'
        title='Know every fan by name.'
        description='Carry source and follow-up in one surface.'
        aside={<p>Capture intent before release day.</p>}
        asideClassName='intro-aside'
      />
    );

    const aside = screen.getByText('Capture intent before release day.');
    expect(aside.parentElement).toHaveClass('intro-aside');
  });
});
