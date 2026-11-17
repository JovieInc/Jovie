import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { page, track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageEditorialHero } from './HomepageEditorialHero';

const { mockPush, mockSearch, mockClear } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearch: vi.fn(),
  mockClear: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: mockSearch,
    searchImmediate: vi.fn(),
    clear: mockClear,
  }),
}));

function renderHero(headline = 'Control how the world sees you.') {
  return render(
    <HomepageEditorialHero
      headingId='home-hero-heading'
      headline={headline}
      support='Find what the internet knows. Turn it into relationships.'
      search={{ placeholder: 'Search your name', action: 'Find me' }}
    />
  );
}

describe('HomepageEditorialHero certificate', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSearch.mockClear();
    vi.mocked(page).mockClear();
    vi.mocked(track).mockClear();
  });

  it('labels the hero by its one headline and records one exposure', async () => {
    const { container } = renderHero();

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Control how the world sees you.',
    });
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'aria-labelledby',
      heading.id
    );
    expect(
      screen.getByText(
        'Find what the internet knows. Turn it into relationships.'
      )
    ).toBeInTheDocument();
    expect(page).toHaveBeenCalledWith('home', HOMEPAGE_CERTIFIED_CONTEXT);
    expect(track).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE,
      HOMEPAGE_CERTIFIED_CONTEXT
    );
    expect(
      screen.getByTestId('homepage-editorial-hero-backdrop')
    ).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('runs the name search from the hero and keeps the typed name', async () => {
    const user = userEvent.setup();
    const { container } = renderHero();
    const input = screen.getByRole('combobox');

    await user.type(input, 'Phoebe');

    expect(input).toHaveValue('Phoebe');
    expect(mockSearch).toHaveBeenLastCalledWith('Phoebe');
    expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
      'Find me'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long headline as one accessible heading', async () => {
    const long =
      'Control how the world sees you, from your first release to every page and fan after it.';
    const { container } = renderHero(long);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(long);
    await expectNoA11yViolations(container);
  });
});
