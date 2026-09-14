// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, loading, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void loading;
    return <img alt='' {...rest} />;
  },
}));

describe('HomepageCertifiedSections', () => {
  it('renders the locked connected and relationships sections without unsupported proof', () => {
    render(<HomepageCertifiedSections />);

    expect(
      screen.queryByTestId('marketing-section-logo-cloud')
    ).not.toBeInTheDocument();

    const sections = screen.getAllByTestId('marketing-section-feature-split');
    expect(sections).toHaveLength(2);
    expect(
      sections.map(section => section.getAttribute('data-marketing-occurrence'))
    ).toEqual(['connected', 'relationships']);

    const connected = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-connected"]'
    )!;
    expect(connected).toHaveAttribute('data-marketing-variant', 'editorial');
    expect(connected).toHaveAttribute('data-rhythm', 'product');
    expect(connected).toHaveTextContent('ONE LIVING PROFILE');
    expect(connected).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[0].headline
    );
    expect(connected).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[0].body
    );
    expect(connected.querySelector('.ap-phone-frame')).toBeNull();
    expect(connected.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/generated/homepage-identity-optical-v1.webp'
    );
    expect(connected.querySelector('img')).toHaveAttribute(
      'alt',
      'A conceptual photographic assembly of a profile identity'
    );

    const relationships = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-relationships"]'
    )!;
    expect(relationships).toHaveAttribute('data-rhythm', 'text');
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].headline
    );
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].body
    );
    expect(relationships.querySelectorAll('img')).toHaveLength(0);
    expect(within(relationships).getByRole('list')).toHaveAttribute(
      'aria-label',
      'Relationships'
    );

    const outcomes = within(relationships).getAllByRole('listitem');
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map(outcome => outcome.textContent)).toEqual([
      expect.stringContaining('Be found. Be understood.'),
      expect.stringContaining('Know who cares.'),
      expect.stringContaining('Built around who you are.'),
    ]);
    expect(
      outcomes.map(outcome => outcome.querySelector('span')?.textContent)
    ).toEqual(['01', '02', '03']);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('HomepageClose', () => {
  it('closes with the locked lines and the name search as the only control', () => {
    render(<HomepageClose />);

    const section = screen.getByRole('region', {
      name: HOMEPAGE_LAUNCH_COPY.certified.close.headline,
    });
    expect(section.tagName).toBe('SECTION');
    expect(section).toBe(screen.getByTestId('marketing-section-cta'));
    expect(section).toHaveAttribute(
      'data-marketing-variant',
      'editorial-search'
    );
    expect(section).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageClose.tsx'
    );
    expect(section).toHaveAttribute('data-homepage-testid', 'homepage-close');
    expect(section).toHaveAttribute('data-rhythm', 'close');
    expect(section.querySelector('section')).toBeNull();
    expect(within(section).getByRole('combobox')).toBe(
      screen.getByRole('combobox')
    );
    expect(within(section).getByRole('button')).toBe(
      screen.getByTestId('homepage-close-cta')
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: HOMEPAGE_LAUNCH_COPY.certified.close.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(HOMEPAGE_LAUNCH_COPY.certified.close.support)
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      HOMEPAGE_LAUNCH_COPY.hero.search.placeholder
    );
    const cta = screen.getByTestId('homepage-close-cta');
    expect(cta).toHaveTextContent('Find me');
    expect(cta).toHaveAttribute('data-size', 'marketing');
    expect(cta).toHaveAttribute('data-variant', 'primary');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    // Quiet wordmark signs the page off without becoming a second control.
    const mark = screen.getByTestId('homepage-close-mark');
    expect(mark.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
