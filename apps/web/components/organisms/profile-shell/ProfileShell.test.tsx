// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeContactPayload } from '@/lib/contacts/obfuscation';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ProfileShell } from './ProfileShell';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/hooks/useBreakpoint', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBreakpoint')>()),
  useBreakpointDown: () => false,
}));

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'testartist',
    spotify_id: 'spotify-1',
    name: 'Test Artist',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const venmo = [
  {
    id: 'venmo-1',
    artist_id: 'artist-1',
    platform: 'venmo',
    url: 'https://venmo.com/testartist',
    clicks: 0,
    is_visible: true,
    sort_order: 0,
  },
] as unknown as LegacySocialLink[];

const contacts: PublicContact[] = [
  {
    id: 'contact-1',
    role: 'bookings',
    roleLabel: 'Booking',
    territorySummary: 'Worldwide',
    territoryCount: 0,
    channels: [
      {
        type: 'email',
        encoded: encodeContactPayload({
          type: 'email',
          value: 'booking@example.com',
        }),
      },
    ],
  },
];

describe('ProfileShell', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes each profile mode button to its mode', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={venmo}
        contacts={contacts}
        showTourButton
        showPayButton
      />
    );

    await user.click(screen.getByRole('button', { name: 'Profile' }));
    await user.click(screen.getByRole('button', { name: 'Contact' }));
    await user.click(screen.getByRole('button', { name: 'Tour Dates' }));
    await user.click(screen.getByRole('button', { name: 'Pay' }));

    expect(pushMock.mock.calls.map(call => call[0])).toEqual([
      '/testartist',
      '/testartist?mode=contact',
      '/testartist?mode=tour',
      '/testartist?mode=pay',
    ]);
  });

  it('opens the shop in a new tab', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    renderWithQueryClient(
      <ProfileShell artist={makeArtist()} socialLinks={[]} showShopButton />
    );

    await user.click(screen.getByRole('button', { name: 'Shop' }));
    expect(open).toHaveBeenCalledWith(
      '/testartist/shop',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('renders the profile with its content and one mode bar, axe-clean', async () => {
    // ProfileFooter renders a mobile and a desktop Legal nav, one hidden by
    // a md: media class; jsdom applies no CSS, so it would see both. The
    // footer is its own component, so this audit covers the shell without it.
    const { container } = renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={venmo}
        showPayButton
        showFooter={false}
      >
        <p>Profile content</p>
      </ProfileShell>
    );

    expect(screen.getByTestId('public-profile-root')).toBeInTheDocument();
    expect(screen.getByTestId('profile-content-stack')).toHaveTextContent(
      'Profile content'
    );
    expect(
      screen.getAllByRole('navigation', { name: 'Profile Modes' })
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('drops the mode bar when the profile has nothing to switch to', async () => {
    const { container } = renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={[]}
        showSocialBar={false}
        showFooter={false}
      />
    );

    expect(
      screen.queryByRole('navigation', { name: 'Profile Modes' })
    ).toBeNull();
    expect(screen.queryByTestId('pay-trigger')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('hides Pay without a Venmo link even when asked to show it', () => {
    renderWithQueryClient(
      <ProfileShell artist={makeArtist()} socialLinks={[]} showPayButton />
    );
    expect(screen.queryByRole('button', { name: 'Pay' })).toBeNull();
  });
});
