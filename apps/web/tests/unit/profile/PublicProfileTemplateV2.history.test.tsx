import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileTemplateV2 } from '@/components/features/profile/templates/PublicProfileTemplateV2';

const mockMergedDSPs = [{ key: 'spotify' }];

vi.mock('@/components/organisms/profile-shell', () => ({
  ProfileNotificationsContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  useProfileShell: () => ({ notificationsContextValue: null }),
}));

vi.mock('@/features/profile/ProfileHeroCard', () => ({
  ArtistHero: ({ onPlayClick, onBellClick }: any) => (
    <div>
      <button type='button' onClick={onPlayClick}>
        Play
      </button>
      <button type='button' onClick={onBellClick}>
        Bell
      </button>
    </div>
  ),
}));

vi.mock('@/features/profile/ProfileViewportShell', () => ({
  ProfileViewportShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/features/profile/ProfileQuickActions', () => ({
  ProfileQuickActions: ({ onModeSelect, onBookClick }: any) => (
    <div>
      <button type='button' onClick={() => onModeSelect('profile')}>
        Home
      </button>
      <button type='button' onClick={() => onModeSelect('tour')}>
        Tour
      </button>
      <button type='button' onClick={() => onModeSelect('tip')}>
        Tip
      </button>
      <button type='button' onClick={() => onModeSelect('about')}>
        About
      </button>
      <button type='button' onClick={onBookClick}>
        Book
      </button>
    </div>
  ),
}));

vi.mock('@/features/profile/SwipeableModeContainer', () => ({
  SwipeableModeContainer: ({ activeIndex, modes }: any) => (
    <div data-testid='mode-panel'>{modes[activeIndex]}</div>
  ),
}));

vi.mock('@/features/profile/ListenDrawer', () => ({
  ListenDrawer: ({ open }: { open: boolean }) => (
    <div data-testid='listen-drawer'>{open ? 'open' : 'closed'}</div>
  ),
}));

vi.mock('@/features/profile/SubscribeDrawer', () => ({
  SubscribeDrawer: ({ open }: { open: boolean }) => (
    <div data-testid='subscribe-drawer'>{open ? 'open' : 'closed'}</div>
  ),
}));

vi.mock('@/features/profile/artist-contacts-button/ContactDrawer', () => ({
  ContactDrawer: ({ open }: { open: boolean }) => (
    <div data-testid='contact-drawer'>{open ? 'open' : 'closed'}</div>
  ),
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: ({ contacts }: { contacts: unknown[] }) => ({
    available: contacts,
    primaryChannel: contacts[0] ?? null,
    isEnabled: contacts.length > 0,
  }),
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => mockMergedDSPs,
}));

vi.mock('@/lib/utils/context-aware-links', () => ({
  detectSourcePlatform: () => null,
  getHeaderSocialLinks: () => [],
}));

vi.mock('@/hooks/useSwipeMode', async () => {
  const React = await import('react');
  return {
    useSwipeMode: ({ initialIndex = 0 }: { initialIndex?: number }) => {
      const [activeIndex, setActiveIndex] = React.useState(initialIndex);
      return {
        activeIndex,
        containerRef: { current: null },
        dragOffset: 0,
        isDragging: false,
        setActiveIndex,
        handlers: {
          onTouchStart: () => {},
          onTouchMove: () => {},
          onTouchEnd: () => {},
        },
      };
    },
  };
});

const artist = {
  id: 'artist-1',
  handle: 'tim',
  name: 'Tim White',
  image_url: 'https://example.com/tim.jpg',
} as any;

const contacts = [
  {
    id: 'contact-1',
    type: 'email',
    value: 'bookings@example.com',
  },
] as any;

describe('PublicProfileTemplateV2 history behavior', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tim?ff_profile_v2=1');
  });

  it('pushes a new URL when a dock mode is selected', async () => {
    render(
      <PublicProfileTemplateV2
        mode='profile'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tour' }));

    await waitFor(() => {
      expect(window.location.search).toContain('mode=tour');
    });
  });

  it('syncs the active mode when browser history changes', async () => {
    render(
      <PublicProfileTemplateV2
        mode='profile'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tour' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('tour');
    });

    window.history.pushState(null, '', '/tim?ff_profile_v2=1');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('profile');
    });
  });

  it('maps legacy listen mode to the profile pane and opens the listen drawer', async () => {
    render(
      <PublicProfileTemplateV2
        mode='listen'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('profile');
      expect(screen.getByTestId('listen-drawer')).toHaveTextContent('open');
    });
  });

  it('maps legacy subscribe mode to the profile pane and opens the subscribe drawer', async () => {
    render(
      <PublicProfileTemplateV2
        mode='subscribe'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('profile');
      expect(screen.getByTestId('subscribe-drawer')).toHaveTextContent('open');
    });
  });

  it('maps legacy contact mode to the profile pane and opens the booking drawer', async () => {
    render(
      <PublicProfileTemplateV2
        mode='contact'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('profile');
      expect(screen.getByTestId('contact-drawer')).toHaveTextContent('open');
    });
  });

  it('opens the subscribe drawer when Play is tapped without DSP links', async () => {
    mockMergedDSPs.length = 0;

    render(
      <PublicProfileTemplateV2
        mode='profile'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => {
      expect(screen.getByTestId('subscribe-drawer')).toHaveTextContent('open');
    });

    mockMergedDSPs.push({ key: 'spotify' });
  });
});
