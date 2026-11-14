import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from '@/features/profile/releases/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';
import { PUBLIC_MUSIC_ERROR_HEADING } from '../profile-surface-state';
import { ProfileCompactTemplate } from './ProfileCompactTemplate';

// State and axe coverage on the real compact surface. The wiring contract
// (drawers, history, flags) lives in tests/unit/profile/profile-compact-template.test.tsx.
// A phone-width sheet hides the desktop shell the way design-system.css does
// below 1180px, so axe audits the page a visitor sees.
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

type TemplateProps = ComponentProps<typeof ProfileCompactTemplate>;

function renderTemplate(props: Partial<TemplateProps> = {}, dir?: 'rtl') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div dir={dir}>
        <ProfileCompactTemplate
          mode='profile'
          artist={PROFILE_STORY_ARTIST}
          socialLinks={[]}
          contacts={[]}
          releases={[RELEASE]}
          {...props}
        />
      </div>
    </QueryClientProvider>
  );
}

function stubAssignmentFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ProfileCompactTemplate states', () => {
  beforeEach(() => {
    stubAssignmentFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    phoneSheet = document.createElement('style');
    phoneSheet.textContent =
      '.public-profile-layout-desktop-shell { display: none; }';
    document.head.append(phoneSheet);
  });

  afterEach(() => {
    phoneSheet?.remove();
    vi.unstubAllGlobals();
  });

  it('shares the profile from the surface', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
    });
    const { container } = renderTemplate();

    await user.click(
      await screen.findByRole('button', { name: "Share Tim White's profile" })
    );
    await waitFor(() => expect(share).toHaveBeenCalled());
    await expectNoA11yViolations(container);
    Reflect.deleteProperty(navigator, 'share');
  });

  it('holds the alert form as a skeleton until the visitor assignment settles', async () => {
    stubAssignmentFetch(() => new Promise<Response>(() => {}));
    const { container } = renderTemplate({ mode: 'subscribe' });

    const surface = await screen.findByTestId('profile-compact-surface');
    expect(
      within(surface).getByText('Loading subscription form')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the default alert form when the assignment request fails offline', async () => {
    const { container } = renderTemplate({ mode: 'subscribe' });

    const surface = await screen.findByTestId('profile-compact-surface');
    await waitFor(() =>
      expect(
        within(surface).queryByText('Loading subscription form')
      ).toBeNull()
    );
    await expectNoA11yViolations(container);
  });

  it('names the failed catalog instead of an empty one', async () => {
    const { container } = renderTemplate({
      mode: 'releases',
      releases: [],
      catalogLoadFailed: true,
    });

    const surface = await screen.findByTestId('profile-compact-surface');
    expect(
      within(surface).getByRole('heading', { name: PUBLIC_MUSIC_ERROR_HEADING })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a new profile with no photo, tagline, links or releases', async () => {
    const { container } = renderTemplate({
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

    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toBeInTheDocument();
    expect(screen.queryByText('Never Say A Word')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('handles a long name and a long catalog', async () => {
    const name = 'Tim White and the Los Angeles After Hours Orchestra';
    const { container } = renderTemplate({
      artist: { ...PROFILE_STORY_ARTIST, name },
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
    const { container } = renderTemplate(
      {
        artist: {
          ...PROFILE_STORY_ARTIST,
          name: 'تيم وايت',
          tagline: 'منتج وكاتب أغانٍ ورومانسي في ساعات الليل المتأخرة.',
        },
      },
      'rtl'
    );

    expect(
      await screen.findByTestId('profile-compact-surface')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
