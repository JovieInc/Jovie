import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileTemplateV2 } from '@/components/features/profile/templates/PublicProfileTemplateV2';

const mockMergedDSPs = [{ key: 'spotify' }];
const scrollIntoViewMock = vi.fn();

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    ProfileNotificationsContext: {
      Provider: ({ children }: { children: React.ReactNode }) => children,
    },
  })
);

vi.mock('@/components/organisms/profile-shell/useProfileShell', () => ({
  useProfileShell: () => ({ notificationsContextValue: null }),
}));

vi.mock('@/components/organisms/profile-shell', () => ({
  ProfileNotificationsContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  useProfileShell: () => ({ notificationsContextValue: null }),
}));

vi.mock('@/features/profile/ProfileHeroCard', () => ({
  ArtistHero: ({ onPlayClick, onBellClick, primaryAction }: any) => (
    <div>
      <button type='button' onClick={onPlayClick}>
        Play
      </button>
      <button type='button' onClick={onBellClick}>
        Bell
      </button>
      {primaryAction ? (
        <button type='button' onClick={primaryAction.onClick}>
          {primaryAction.label}
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('@/features/profile/ProfileScrollBody', () => ({
  ProfileScrollBody: ({
    tourSectionRef,
    subscribeSectionRef,
    onTipClick,
    onContactClick,
  }: any) => (
    <main>
      <section ref={subscribeSectionRef}>Subscribe Section</section>
      <section ref={tourSectionRef}>Tour Section</section>
      <button type='button' onClick={onTipClick}>
        Tip
      </button>
      <button type='button' onClick={onContactClick}>
        Contact
      </button>
    </main>
  ),
}));

vi.mock('@/features/profile/ProfileViewportShell', () => ({
  ProfileViewportShell: ({
    header,
    children,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));

vi.mock('@/features/profile/ListenDrawer', () => ({
  ListenDrawer: ({ open }: { open: boolean }) => (
    <div data-testid='listen-drawer'>{open ? 'open' : 'closed'}</div>
  ),
}));

vi.mock('@/features/profile/PayDrawer', () => ({
  PayDrawer: ({ open }: { open: boolean }) => (
    <div data-testid='pay-drawer'>{open ? 'open' : 'closed'}</div>
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

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => mockMergedDSPs,
}));

vi.mock('@/lib/utils/context-aware-links', () => ({
  detectSourcePlatform: () => null,
  getHeaderSocialLinks: (links: unknown[]) => links,
}));

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

const tipLinks = [
  {
    id: 'tip-1',
    artist_id: 'artist-1',
    platform: 'venmo',
    url: 'https://venmo.com/u/timwhite',
    clicks: 0,
    created_at: '2025-01-01T00:00:00Z',
  },
] as any;

describe('PublicProfileTemplateV2 history behavior', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tim?ff_profile_v2=1');
    scrollIntoViewMock.mockReset();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it('pushes a new URL when the listen drawer opens', async () => {
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
      expect(window.location.search).toContain('mode=listen');
      expect(screen.getByTestId('listen-drawer')).toHaveTextContent('open');
    });
  });

  it('syncs overlay state from browser history changes', async () => {
    render(
      <PublicProfileTemplateV2
        mode='profile'
        artist={artist}
        socialLinks={tipLinks}
        contacts={contacts}
        tourDates={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tip' }));

    await waitFor(() => {
      expect(screen.getByTestId('pay-drawer')).toHaveTextContent('open');
      expect(window.location.search).toContain('mode=pay');
    });

    window.history.pushState(null, '', '/tim?ff_profile_v2=1');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(screen.getByTestId('pay-drawer')).toHaveTextContent('closed');
    });
  });

  it('maps legacy listen mode to the listen drawer', async () => {
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
      expect(screen.getByTestId('listen-drawer')).toHaveTextContent('open');
    });
  });

  it('maps legacy subscribe mode to the inline subscribe section', async () => {
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
      expect(window.location.search).toContain('mode=subscribe');
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('maps legacy contact mode to the contact drawer', async () => {
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
      expect(screen.getByTestId('contact-drawer')).toHaveTextContent('open');
    });
  });

  it('maps pay mode to the pay drawer', async () => {
    render(
      <PublicProfileTemplateV2
        mode='pay'
        artist={artist}
        socialLinks={tipLinks}
        contacts={contacts}
        tourDates={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('pay-drawer')).toHaveTextContent('open');
    });
  });

  it('scrolls to the tour section for legacy tour mode URLs', async () => {
    render(
      <PublicProfileTemplateV2
        mode='tour'
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        tourDates={
          [
            {
              id: 'tour-1',
              startDate: '2026-06-01T00:00:00.000Z',
              city: 'Los Angeles',
              region: 'CA',
              country: 'USA',
              venueName: 'The Forum',
              ticketUrl: 'https://example.com/tickets',
            },
          ] as any
        }
      />
    );

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('routes Play to inline subscribe when no DSP links exist', async () => {
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
      expect(window.location.search).toContain('mode=subscribe');
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    mockMergedDSPs.push({ key: 'spotify' });
  });
});
