import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA';
import type { Artist } from '@/types/db';

const mockUseSubscriptionForm = vi.fn();
const mockUpdateSubscriberNameMutation = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();

vi.mock('motion/react', async () => {
  await import('react');

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        readonly children: React.ReactNode;
      }) => <div {...props}>{children}</div>,
    },
    useReducedMotion: () => false,
  };
});

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({
    user: null,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useUpdateSubscriberBirthdayMutation: () =>
    mockUpdateSubscriberBirthdayMutation(),
  useUpdateSubscriberNameMutation: () => mockUpdateSubscriberNameMutation(),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: (...args: unknown[]) =>
      mockUseSubscriptionForm(...args),
  })
);

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

describe('ProfileInlineNotificationsCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    mockUseSubscriptionForm.mockReturnValue({
      emailInput: '',
      error: null,
      isSubmitting: false,
      handleChannelChange: vi.fn(),
      handleEmailChange: vi.fn(),
      handleFieldBlur: vi.fn(),
      handleSubscribe: vi.fn().mockResolvedValue(undefined),
      notificationsState: 'success',
      notificationsEnabled: true,
      openSubscription: vi.fn(),
      hydrationStatus: 'done',
      subscribedChannels: { email: true },
    });

    mockUpdateSubscriberNameMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });

    mockUpdateSubscriberBirthdayMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders a subscribed-state button with compact success copy', () => {
    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    expect(
      screen.getByRole('button', { name: /manage notifications/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Notifications on')).toBeInTheDocument();
    expect(
      screen.queryByText(/we'll notify you when/i)
    ).not.toBeInTheDocument();
  });

  it('opens preferences when the subscribed button is clicked', () => {
    const onManageNotifications = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /manage notifications/i })
    );

    expect(onManageNotifications).toHaveBeenCalledTimes(1);
  });

  it('opens preferences when keyboard focus tabs onto the subscribed button', () => {
    const onManageNotifications = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    const button = screen.getByRole('button', {
      name: /manage notifications/i,
    });

    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(button);

    expect(onManageNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not auto-open preferences on pointer focus alone', () => {
    const onManageNotifications = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    const button = screen.getByRole('button', {
      name: /manage notifications/i,
    });

    fireEvent.pointerDown(window);
    fireEvent.focus(button);

    expect(onManageNotifications).not.toHaveBeenCalled();
  });

  it('does not create a reopen loop when focus returns after closing the drawer', () => {
    const onManageNotifications = vi.fn();
    const drawer = document.createElement('div');
    drawer.setAttribute('data-testid', 'profile-menu-drawer');
    const drawerButton = document.createElement('button');
    drawer.appendChild(drawerButton);
    document.body.appendChild(drawer);

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    const button = screen.getByRole('button', {
      name: /manage notifications/i,
    });
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);

    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(button);
    expect(onManageNotifications).toHaveBeenCalledTimes(1);

    fireEvent.blur(button, { relatedTarget: drawerButton });
    fireEvent.focus(button);
    expect(onManageNotifications).toHaveBeenCalledTimes(1);

    fireEvent.blur(button, { relatedTarget: outsideButton });
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(button);
    expect(onManageNotifications).toHaveBeenCalledTimes(2);
  });
});
