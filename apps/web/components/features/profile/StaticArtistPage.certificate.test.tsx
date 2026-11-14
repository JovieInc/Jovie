import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from '@/features/profile/releases/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticArtistPage } from './StaticArtistPage';

// The real compact template renders here (StaticArtistPage.test.tsx stubs it).
// Visit, assignment and dismissal requests go to a fetch that fails, so the
// page settles in its offline defaults and nothing reaches the network.
const fetchMock = vi.fn(async () => {
  throw new TypeError('Failed to fetch');
});

// jsdom loads no stylesheet. design-system.css hides the desktop shell below
// 1180px, so this sheet applies that base rule and axe audits the phone page
// a visitor actually sees, with one Profile Navigation landmark.
let phoneSheet: HTMLStyleElement | null = null;

const RELEASE: PublicRelease = {
  id: 'release-1',
  title: 'Never Say A Word',
  slug: 'never-say-a-word',
  releaseType: 'single',
  releaseDate: '2026-08-01',
  artworkUrl: '/images/avatars/tim-white.jpg',
  artistNames: ['Tim White'],
};

function renderPage({
  artist = PROFILE_STORY_ARTIST,
  releases = [RELEASE],
  dir,
}: {
  readonly artist?: Artist;
  readonly releases?: readonly PublicRelease[];
  readonly dir?: 'rtl';
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div dir={dir}>
        <StaticArtistPage
          mode='profile'
          artist={artist}
          socialLinks={[]}
          contacts={[]}
          subtitle='Artist profile'
          showBackButton={false}
          releases={releases}
        />
      </div>
    </QueryClientProvider>
  );
}

describe('StaticArtistPage: certificate states', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    phoneSheet = document.createElement('style');
    phoneSheet.textContent =
      '.public-profile-layout-desktop-shell { display: none; }';
    document.head.append(phoneSheet);
  });

  afterEach(() => {
    phoneSheet?.remove();
    vi.unstubAllGlobals();
  });

  it('has no axe violations for a full profile', async () => {
    const { container } = renderPage();
    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toHaveAttribute('data-mode', 'profile');
    expect(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for an empty new profile', async () => {
    const { container } = renderPage({
      artist: { ...PROFILE_STORY_ARTIST, tagline: undefined, location: null },
      releases: [],
    });
    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toBeInTheDocument();
    expect(screen.queryByText('Never Say A Word')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with no photo, tagline or location', async () => {
    const { container } = renderPage({
      artist: {
        ...PROFILE_STORY_ARTIST,
        image_url: undefined,
        tagline: undefined,
        location: null,
        settings: {},
      },
    });
    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with a long name and a long catalog', async () => {
    const name = 'Tim White and the Los Angeles After Hours Orchestra';
    const { container } = renderPage({
      artist: {
        ...PROFILE_STORY_ARTIST,
        name,
        tagline:
          'Producer, songwriter, and after-hours romantic scoring late-night drives and sunrise sets.',
      },
      releases: Array.from({ length: 8 }, (_, index) => ({
        ...RELEASE,
        id: `release-${index + 1}`,
        slug: `never-say-a-word-part-${index + 1}`,
        title: `Never Say A Word (Extended Club Mix) Part ${index + 1}`,
      })),
    });
    expect(
      await screen.findByRole('button', { name: `Share ${name}'s profile` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const { container } = renderPage({
      artist: {
        ...PROFILE_STORY_ARTIST,
        name: 'تيم وايت',
        tagline: 'منتج وكاتب أغانٍ ورومانسي في ساعات الليل المتأخرة.',
      },
      dir: 'rtl',
    });
    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
