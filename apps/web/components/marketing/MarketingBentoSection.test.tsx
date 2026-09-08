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
    ...rest
  }: {
    readonly children: ReactNode;
    readonly href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const card = (
  id: string,
  title: string,
  extra: Partial<MarketingBentoCard> = {}
) =>
  ({
    id,
    title,
    body: `${title} body.`,
    ...extra,
  }) as MarketingBentoCard;

const sectionCards = {
  featuredStart: card('release-plan', 'Know what ships next', {
    preview: <div />,
    previewLabel: 'Release preview',
    action: { href: '/start', label: 'Plan' },
  }),
  supportingTop: card('profile', 'One profile for every fan', {
    preview: <div />,
    previewLabel: 'Profile preview',
    previewAspect: 'landscape',
  }),
  supportingBottom: card('signals', 'Signals worth acting on'),
  featuredEnd: card('fans', 'Keep every fan close', {
    preview: <div />,
    previewLabel: 'Fan preview',
    previewAspect: 'square',
    action: { href: '/artist-profiles', label: 'Explore' },
  }),
};

function renderSection(titleId = 'jovie-bento-title') {
  return render(
    <MarketingBentoSection
      eyebrow='Inside Jovie'
      title='Your release work, connected.'
      titleId={titleId}
      description='Shared release and fan activity.'
      {...sectionCards}
    />
  );
}

describe('MarketingBentoSection', () => {
  it('renders the bounded labelled section with named grid rhythm', () => {
    renderSection();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Your release work, connected.',
      })
    ).toHaveClass('marketing-h2-linear', 'line-clamp-2');

    const grid = screen.getByTestId('marketing-bento-grid');
    expect(grid).toHaveAttribute('data-layout', 'three-column-two-row');
    expect(grid).toHaveClass(
      'grid-cols-1',
      'md:grid-cols-2',
      'xl:grid-cols-3',
      'xl:grid-rows-2'
    );

    const cards = screen.getAllByTestId('marketing-bento-card');
    expect(cards.map(item => item.dataset.slot)).toEqual([
      'featured-start',
      'supporting-top',
      'supporting-bottom',
      'featured-end',
    ]);
    expect(cards[0]).toHaveClass('xl:col-start-1', 'xl:row-span-2');
    expect(cards[3]).toHaveClass('xl:col-start-3', 'xl:row-span-2');
  });

  it('preserves preview geometry, actions, and secondary token copy', () => {
    renderSection();

    expect(
      screen.getByRole('figure', { name: 'Release preview' })
    ).toHaveAttribute('data-preview-aspect', 'portrait');
    expect(
      screen.getByRole('figure', { name: 'Profile preview' })
    ).toHaveAttribute('data-preview-aspect', 'landscape');
    expect(screen.getByText('Shared release and fan activity.')).toHaveClass(
      'marketing-bento-section__secondary'
    );
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveClass(
      'public-action-secondary',
      'focus-ring-themed',
      'min-h-11'
    );
  });

  it('rejects the deliberate-red equal-column rhythm', () => {
    render(<MarketingBentoBrokenRhythmFixture />);
    renderSection();

    expect(
      screen.getByTestId(MARKETING_BENTO_BROKEN_RHYTHM_FIXTURE_TEST_ID)
    ).toHaveClass('xl:grid-cols-4');
    expect(screen.getByTestId('marketing-bento-grid')).toHaveClass(
      'xl:grid-cols-3',
      'xl:grid-rows-2'
    );
  });
});
