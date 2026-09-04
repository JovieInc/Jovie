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

const image = (alt: string) => ({
  publicUrl: `/product-screenshots/${alt}.png`,
  width: 780,
  height: 1688,
  alt,
});

const PREVIEWS = {
  connected: image('listen'),
  relationships: [image('subscribe'), image('pay'), image('tour')],
} as const;

describe('HomepageCertifiedSections', () => {
  it('renders sections 2-8 with the locked copy, in order, no logos', () => {
    render(<HomepageCertifiedSections previews={PREVIEWS} />);

    const proof = screen.getByTestId('homepage-proof');
    expect(proof).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.proof.statement
    );
    expect(proof.querySelectorAll('img, svg')).toHaveLength(0);

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map(heading => heading.textContent)).toEqual(
      HOMEPAGE_LAUNCH_COPY.certified.sections.map(section => section.headline)
    );
    for (const section of HOMEPAGE_LAUNCH_COPY.certified.sections) {
      const region = screen.getByTestId(`homepage-section-${section.id}`);
      expect(region).toHaveTextContent(section.body);
      expect(region).toHaveAttribute(
        'aria-labelledby',
        `homepage-section-${section.id}-heading`
      );
    }

    // Real product exports only where the copy talks about the profile.
    expect(
      within(screen.getByTestId('homepage-section-connected')).getAllByRole(
        'img'
      )
    ).toHaveLength(1);
    expect(
      within(screen.getByTestId('homepage-section-relationships')).getAllByRole(
        'img'
      )
    ).toHaveLength(3);
    for (const id of ['found', 'know', 'smarter', 'built']) {
      expect(
        within(screen.getByTestId(`homepage-section-${id}`)).queryAllByRole(
          'img'
        )
      ).toHaveLength(0);
    }

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('closes with the locked lines and the name search as the only control', () => {
    render(<HomepageClose />);

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

    expect(screen.queryByTestId('homepage-close-mark')).not.toBeInTheDocument();
    expect(screen.getByTestId('homepage-close-depth')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
