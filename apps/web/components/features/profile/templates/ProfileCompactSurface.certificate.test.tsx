import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from '@/features/profile/releases/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  PROFILE_STORY_ARTIST,
  profileStoryNoop,
} from '../profile-story-fixture';
import { ProfileCompactSurface } from './ProfileCompactSurface';

// State and axe coverage on the real compact surface (no mocked panels). The
// wiring contract stays in ProfileCompactSurface.test.tsx.
const emitProofClaimEvent = vi.fn();

vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: (...args: unknown[]) => emitProofClaimEvent(...args),
  rememberProofClaimAttribution: vi.fn(),
}));

const RELEASE: PublicRelease = {
  id: 'release-1',
  title: 'Never Say A Word',
  slug: 'never-say-a-word',
  releaseType: 'single',
  releaseDate: '2026-08-01',
  artworkUrl: '/images/avatars/tim-white.jpg',
  artistNames: ['Tim White'],
};

type SurfaceProps = ComponentProps<typeof ProfileCompactSurface>;

// Clicks stay on the page: jsdom cannot navigate to another document.
const stayOnPage = (event: MouseEvent) => event.preventDefault();

function renderSurface(props: Partial<SurfaceProps> = {}, dir?: 'rtl') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div dir={dir}>
        <ProfileCompactSurface
          artist={PROFILE_STORY_ARTIST}
          socialLinks={[]}
          contacts={[]}
          drawerOpen={false}
          drawerView='menu'
          onDrawerOpenChange={profileStoryNoop}
          onDrawerViewChange={profileStoryNoop}
          onBack={profileStoryNoop}
          onOpenMenu={profileStoryNoop}
          onPlayClick={profileStoryNoop}
          onShare={profileStoryNoop}
          profileHref='/timwhite'
          releases={[RELEASE]}
          {...props}
        />
      </div>
    </QueryClientProvider>
  );
}

describe('ProfileCompactSurface states', () => {
  beforeEach(() => {
    // No request may leave the test; a pending fetch keeps any panel loading.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
    emitProofClaimEvent.mockClear();
    document.addEventListener('click', stayOnPage);
  });

  afterEach(() => {
    document.removeEventListener('click', stayOnPage);
    vi.unstubAllGlobals();
  });

  it('paints its sheen and claim bar from tokens and sends the claim click', async () => {
    const user = userEvent.setup();
    const { container } = renderSurface({
      proofClaimCta: { href: '/start', label: 'Claim yours' },
    });

    const surface = screen.getByTestId('profile-compact-surface');
    expect(
      surface.querySelector('.bg-\\(image\\:--profile-compact-sheen\\)')
    ).not.toBeNull();
    // on-media is the fixed #ffffff in light and dark.
    const cta = screen.getByTestId('profile-proof-claim-bar-cta');
    expect(cta).toHaveClass(
      'text-on-media/88',
      'hover:text-on-media',
      'focus-visible:ring-on-media/70'
    );
    expect(within(cta).getByText('jov.ie/')).toHaveClass('text-on-media/55');

    await user.click(cta);
    expect(emitProofClaimEvent).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({ destination: '/start', label: 'Claim yours' })
    );
    await expectNoA11yViolations(container);
  });

  it('shares the profile from the header', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    const { container } = renderSurface();

    await user.click(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    );
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await expectNoA11yViolations(container);
    Reflect.deleteProperty(navigator, 'share');
  });

  it('rings the focusable content region on a non-home tab', async () => {
    const { container } = renderSurface({ activeMode: 'about' });

    expect(screen.getByTestId('profile-content-scroll')).toHaveClass(
      'focus-visible:ring-on-media/70'
    );
    await expectNoA11yViolations(container);
  });

  it('holds the alert form as a skeleton until the visitor assignment resolves', async () => {
    const { container } = renderSurface({
      activeMode: 'subscribe',
      visitorAssignmentResolved: false,
    });

    expect(
      await screen.findByText('Loading subscription form')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the Music tab for an artist with no releases', async () => {
    const { container } = renderSurface({
      activeMode: 'listen',
      releases: [],
      latestRelease: null,
    });

    expect(screen.getByTestId('profile-compact-surface')).toHaveAttribute(
      'data-mode',
      'listen'
    );
    expect(screen.queryByText('Never Say A Word')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders a new profile with no photo, tagline, location or links', async () => {
    const { container } = renderSurface({
      artist: {
        ...PROFILE_STORY_ARTIST,
        image_url: undefined,
        tagline: undefined,
        location: null,
        settings: {},
      },
      releases: [],
      latestRelease: null,
    });

    expect(screen.getByTestId('profile-compact-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-identity-social-row')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('carries a long name over a long catalog', async () => {
    const name = 'Tim White and the Los Angeles After Hours Orchestra';
    const { container } = renderSurface({
      artist: { ...PROFILE_STORY_ARTIST, name },
      activeMode: 'listen',
      releases: Array.from({ length: 8 }, (_, index) => ({
        ...RELEASE,
        id: `release-${index + 1}`,
        slug: `never-say-a-word-part-${index + 1}`,
        title: `Never Say A Word (Extended Club Mix) Part ${index + 1}`,
      })),
    });

    expect(
      screen.getByRole('button', { name: `Share ${name}'s profile` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the claim bar and header controls usable right to left', async () => {
    const { container } = renderSurface(
      {
        artist: {
          ...PROFILE_STORY_ARTIST,
          name: 'تيم وايت',
          tagline: 'منتج وكاتب أغانٍ ورومانسي في ساعات الليل المتأخرة.',
        },
        proofClaimCta: { href: '/start', label: 'احصل على صفحتك' },
      },
      'rtl'
    );

    expect(screen.getByTestId('profile-proof-claim-bar-cta')).toHaveTextContent(
      'احصل على صفحتك'
    );
    await expectNoA11yViolations(container);
  });
});
