import { render, screen, within } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ArtistProfileAnnotatedTruth,
  ArtistProfileLandingPage,
} from './ArtistProfileLandingPage';
import {
  EmptyCallouts,
  LongContentCallouts,
  RtlArabic,
} from './ArtistProfileLandingPage.states.stories';

// next/image with `priority` asks React DOM to preload by a srcset selector
// longer than jsdom's selector limit; image loading is not under test here.
vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    unoptimized: _unoptimized,
    loader: _loader,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => (
    <img {...props} alt={typeof props.alt === 'string' ? props.alt : ''} />
  ),
}));

const SPEC_WALL = ARTIST_PROFILE_COPY.specWall;

describe('ArtistProfileAnnotatedTruth', () => {
  it('draws callout rules from one divided list, not a box per row', async () => {
    const { container } = render(
      <ArtistProfileAnnotatedTruth specWall={SPEC_WALL} />
    );

    const tiles = screen.getAllByTestId('artist-profile-truth-tile');
    expect(tiles).toHaveLength(SPEC_WALL.callouts?.length ?? 4);
    const list = tiles[0].parentElement;
    expect(list?.tagName).toBe('OL');
    expect(list).toHaveClass('divide-y', 'divide-subtle', 'border-y');
    for (const tile of tiles) expect(tile.className).not.toMatch(/\bborder/);
    expect(within(tiles[0]).getByText('01')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: SPEC_WALL.headline })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an empty callout list and no related features', async () => {
    const specWall = EmptyCallouts.args?.copy?.specWall ?? SPEC_WALL;
    const { container } = render(
      <ArtistProfileAnnotatedTruth specWall={specWall} />
    );

    expect(screen.queryAllByTestId('artist-profile-truth-tile')).toHaveLength(
      0
    );
    expect(
      screen.queryAllByTestId('artist-profile-related-feature')
    ).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps long callout copy whole', async () => {
    const specWall = LongContentCallouts.args?.copy?.specWall ?? SPEC_WALL;
    const { container } = render(
      <ArtistProfileAnnotatedTruth specWall={specWall} />
    );

    const first = specWall.callouts?.[0];
    expect(
      screen.getByRole('heading', { level: 3, name: first?.title })
    ).toBeInTheDocument();
    expect(screen.getByText(first?.body ?? '')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic callouts in a right-to-left document', async () => {
    const specWall = RtlArabic.args?.copy?.specWall ?? SPEC_WALL;
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileAnnotatedTruth specWall={specWall} />
      </div>
    );

    expect(screen.getAllByTestId('artist-profile-truth-tile')).toHaveLength(4);
    expect(
      screen.getByRole('heading', { level: 3, name: 'يعرفون أنه أنت' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('ArtistProfileLandingPage', () => {
  it('renders only the hero when the full page is off', async () => {
    const { container } = render(
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        flags={{ ...ARTIST_PROFILE_FLAGS, FULL_PAGE: false }}
        logoPlacement={{ page: '/artist-profiles' }}
      />
    );

    expect(
      screen.getByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.hero)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.specWall)
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('leaves the FAQ out when its flag is off', async () => {
    const { container } = render(
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        flags={{ ...ARTIST_PROFILE_FLAGS, FAQ: false }}
        logoPlacement={{ page: '/artist-profiles' }}
      />
    );

    expect(
      screen.getByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.specWall)
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.finalCta)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.faq)
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
