import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  MARKETING_BENTO_BROKEN_RHYTHM_FIXTURE_TEST_ID,
  MarketingBentoBrokenRhythmFixture,
} from '@/tests/fixtures/marketing/MarketingBentoBrokenRhythmFixture';
import {
  type MarketingBentoCard,
  MarketingBentoSection,
} from './MarketingBentoSection';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: ReactNode;
    readonly href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const featuredStart: MarketingBentoCard = {
  id: 'release-plan',
  title: 'Know what ships next',
  body: 'Keep release work and dates in one clear view.',
  preview: <div data-testid='release-preview' />,
  previewLabel: 'Release workflow preview',
  action: { href: '/start', label: 'Plan a release' },
};

const supportingTop: MarketingBentoCard = {
  id: 'profile',
  title: 'One profile for every fan',
  body: 'Show the next useful release, link, or action.',
  preview: <div data-testid='profile-preview' />,
  previewLabel: 'Adaptive profile preview',
  previewAspect: 'landscape',
};

const supportingBottom: MarketingBentoCard = {
  id: 'signals',
  title: 'Signals worth acting on',
  body: 'See which release moments need attention.',
};

const featuredEnd: MarketingBentoCard = {
  id: 'fans',
  title: 'Keep every fan close',
  body: 'Carry fan context into the next release.',
  preview: <div data-testid='fan-preview' />,
  previewLabel: 'Fan activity preview',
  previewAspect: 'square',
  action: { href: '/artist-profiles', label: 'Explore artist profiles' },
};

function renderSection(titleId = 'jovie-bento-title') {
  return render(
    <MarketingBentoSection
      eyebrow='Inside Jovie'
      title='Your release work, connected.'
      titleId={titleId}
      description='A shared view of releases, profiles, and fan activity.'
      featuredStart={featuredStart}
      supportingTop={supportingTop}
      supportingBottom={supportingBottom}
      featuredEnd={featuredEnd}
    />
  );
}

describe('MarketingBentoSection', () => {
  it('renders one labelled section with four named semantic cards', () => {
    renderSection();

    expect(
      screen.getByRole('region', {
        name: 'Your release work, connected.',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(
      screen
        .getAllByTestId('marketing-bento-card')
        .map(card => card.dataset.slot)
    ).toEqual([
      'featured-start',
      'supporting-top',
      'supporting-bottom',
      'featured-end',
    ]);
  });

  it('scopes card labels to each reusable section instance', () => {
    renderSection('first-bento-title');
    renderSection('second-bento-title');

    const cardHeadingIds = screen
      .getAllByRole('heading', { level: 3 })
      .map(heading => heading.id);
    expect(new Set(cardHeadingIds).size).toBe(8);
    expect(cardHeadingIds).toContain(
      'first-bento-title-featured-start-release-plan-title'
    );
    expect(cardHeadingIds).toContain(
      'second-bento-title-featured-start-release-plan-title'
    );
  });

  it('keeps ARIA references unique when sanitized caller IDs collide', () => {
    render(
      <MarketingBentoSection
        eyebrow='Inside Jovie'
        title='Collision check'
        titleId='collision-bento-title'
        description='A reusable section with adversarial card IDs.'
        featuredStart={{ ...featuredStart, id: 'profile.v2' }}
        supportingTop={{ ...supportingTop, id: 'profile-v2' }}
        supportingBottom={supportingBottom}
        featuredEnd={featuredEnd}
      />
    );

    const articles = screen.getAllByRole('article');
    const titleReferences = articles.map(article =>
      article.getAttribute('aria-labelledby')
    );
    const bodyReferences = articles.map(article =>
      article.getAttribute('aria-describedby')
    );

    expect(new Set(titleReferences).size).toBe(4);
    expect(new Set(bodyReferences).size).toBe(4);
    for (const reference of [...titleReferences, ...bodyReferences]) {
      expect(reference).not.toBeNull();
      expect(document.getElementById(reference ?? '')).not.toBeNull();
    }
  });

  it('locks the responsive three-column two-row rhythm to named spans', () => {
    renderSection();

    const grid = screen.getByTestId('marketing-bento-grid');
    expect(grid).toHaveAttribute('data-layout', 'three-column-two-row');
    expect(grid).toHaveClass(
      'grid-cols-1',
      'md:grid-cols-2',
      'xl:grid-cols-3',
      'xl:grid-rows-2'
    );
    expect(grid).not.toHaveClass('xl:grid-cols-4');

    const cards = screen.getAllByTestId('marketing-bento-card');
    expect(cards[0]).toHaveClass('xl:col-start-1', 'xl:row-span-2');
    expect(cards[1]).toHaveClass('xl:col-start-2', 'xl:row-start-1');
    expect(cards[2]).toHaveClass('xl:col-start-2', 'xl:row-start-2');
    expect(cards[3]).toHaveClass('xl:col-start-3', 'xl:row-span-2');
  });

  it('labels previews, preserves no-preview card geometry, and exposes only explicit actions', () => {
    renderSection();

    expect(
      screen.getByRole('figure', { name: 'Release workflow preview' })
    ).toHaveAttribute('data-preview-aspect', 'portrait');
    expect(
      screen.getByRole('figure', { name: 'Adaptive profile preview' })
    ).toHaveAttribute('data-preview-aspect', 'landscape');

    const noPreviewCard = screen
      .getAllByTestId('marketing-bento-card')
      .find(card => card.dataset.slot === 'supporting-bottom');
    expect(noPreviewCard).toHaveAttribute('data-has-preview', 'false');
    expect(noPreviewCard?.querySelector('[tabindex]')).toBeNull();

    const actions = screen.getAllByRole('link');
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action).toHaveClass(
        'public-action-secondary',
        'focus-ring-themed',
        'min-h-11'
      );
    }
  });

  it('binds section and card copy to the canonical secondary text token', () => {
    renderSection();

    expect(
      screen.getByText('A shared view of releases, profiles, and fan activity.')
    ).toHaveClass('marketing-bento-section__secondary');
    expect(
      screen.getByText('Keep release work and dates in one clear view.')
    ).toHaveClass('marketing-bento-section__secondary');
  });

  it('rejects the deliberate-red equal-column rhythm', () => {
    render(<MarketingBentoBrokenRhythmFixture />);
    renderSection();

    const fixture = screen.getByTestId(
      MARKETING_BENTO_BROKEN_RHYTHM_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture).toHaveClass('xl:grid-cols-4');
    expect(fixture).not.toHaveClass('xl:grid-cols-3', 'xl:grid-rows-2');

    const production = screen.getByTestId('marketing-bento-grid');
    expect(production).toHaveClass('xl:grid-cols-3', 'xl:grid-rows-2');
    expect(production).not.toHaveAttribute('data-deliberate-red');
  });
});
