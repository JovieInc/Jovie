import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingSectionIntro } from './MarketingSectionIntro';

const requiredProps = {
  eyebrow: 'Artist profiles',
  title: 'One profile for every fan.',
  description: 'Show the release, link, or action that fits each visit.',
};

describe('MarketingSectionIntro', () => {
  it('renders labelled copy with a title id, badges, and an optional aside', () => {
    render(
      <MarketingSectionIntro
        {...requiredProps}
        titleId='artist-profile-intro'
        badges={[
          { label: 'Release context', testId: 'release-badge' },
          { label: 'Direct action', testId: 'action-badge' },
        ]}
        aside={<div data-testid='intro-aside'>Profile preview</div>}
      />
    );

    expect(screen.getByText('Artist profiles')).toHaveClass(
      'homepage-section-eyebrow'
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One profile for every fan.',
      })
    ).toHaveAttribute('id', 'artist-profile-intro');
    expect(screen.getByTestId('release-badge')).toHaveTextContent(
      'Release context'
    );
    expect(screen.getByTestId('action-badge')).toHaveTextContent(
      'Direct action'
    );
    expect(screen.getByTestId('intro-aside')).toBeInTheDocument();
  });

  it('keeps caller class hooks while omitting empty optional slots', () => {
    const { container } = render(
      <MarketingSectionIntro
        {...requiredProps}
        className='intro-hook'
        copyClassName='copy-hook'
        titleClassName='title-hook'
        descriptionClassName='description-hook'
        asideClassName='aside-hook'
        badges={[]}
      />
    );

    expect(container.firstElementChild).toHaveClass(
      'homepage-section-intro',
      'intro-hook'
    );
    expect(
      screen.getByRole('heading', { name: requiredProps.title })
    ).toHaveClass('title-hook');
    expect(screen.getByText(requiredProps.description)).toHaveClass(
      'description-hook'
    );
    expect(
      screen.getByText(requiredProps.description).parentElement
    ).toHaveClass('copy-hook');
    expect(screen.queryByTestId('intro-aside')).not.toBeInTheDocument();
    expect(screen.queryByText('Release context')).not.toBeInTheDocument();
  });
});
