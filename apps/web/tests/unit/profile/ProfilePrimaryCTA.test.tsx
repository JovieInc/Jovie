import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileShell } from '@/components/organisms/profile-shell';
import { ProfilePrimaryCTA } from '@/components/profile/ProfilePrimaryCTA';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: true }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ProfilePrimaryCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
  });

  it('shows Listen CTA (not Subscribe capture) while subscription status is hydrating from stored contacts', () => {
    window.localStorage.setItem(
      'jovie:notification-contacts',
      JSON.stringify({ email: 'fan@example.com' })
    );

    render(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={[] as LegacySocialLink[]}
        contacts={[] as PublicContact[]}
        showNotificationButton
      >
        <ProfilePrimaryCTA
          artist={makeArtist()}
          socialLinks={[] as LegacySocialLink[]}
          spotifyPreferred={false}
          showCapture
        />
      </ProfileShell>
    );

    expect(
      screen.getByRole('link', { name: /open listen page/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^subscribe$/i })
    ).not.toBeInTheDocument();
  });
});
