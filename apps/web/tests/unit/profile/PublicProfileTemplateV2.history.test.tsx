import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileTemplateV2 } from '@/components/features/profile/templates/PublicProfileTemplateV2';

vi.mock('@/components/organisms/profile-shell', () => ({
  ProfileNotificationsContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  useProfileShell: () => ({ notificationsContextValue: null }),
}));

vi.mock('@/features/profile/ProfileHeroCard', () => ({
  ArtistHero: ({ activeMode, modes, onModeSelect }: any) => (
    <div>
      <div role='tablist' aria-label='Profile sections'>
        {modes.map((mode: string) => (
          <button
            key={mode}
            type='button'
            role='tab'
            aria-selected={mode === activeMode}
            onClick={() => onModeSelect(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
      <div>hero</div>
    </div>
  ),
}));

vi.mock('@/features/profile/SwipeableModeContainer', () => ({
  SwipeableModeContainer: ({ activeIndex, modes }: any) => (
    <div data-testid='mode-panel'>{modes[activeIndex]}</div>
  ),
}));

vi.mock('@/features/profile/ListenDrawer', () => ({
  ListenDrawer: () => null,
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => [],
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

describe('PublicProfileTemplateV2 history behavior', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tim?ff_profile_v2=1');
  });

  it('pushes a new URL when a mode tab is selected', async () => {
    render(
      <PublicProfileTemplateV2
        mode='profile'
        artist={artist}
        socialLinks={[]}
        contacts={[]}
        tourDates={[]}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'listen' }));

    await waitFor(() => {
      expect(window.location.search).toContain('mode=listen');
    });
  });

  it('syncs the active mode when browser history changes', async () => {
    render(
      <PublicProfileTemplateV2
        mode='profile'
        artist={artist}
        socialLinks={[]}
        contacts={[]}
        tourDates={[]}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'listen' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('listen');
    });

    window.history.pushState(null, '', '/tim?ff_profile_v2=1');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(screen.getByTestId('mode-panel')).toHaveTextContent('profile');
    });
  });
});
