import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useCallback, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatEntityPanelProvider,
  useChatEntityPanel,
} from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { ChatEntityRightPanelHost } from '@/app/app/(shell)/chat/ChatEntityRightPanelHost';

const { mockUseRegisterRightPanel } = vi.hoisted(() => ({
  mockUseRegisterRightPanel: vi.fn(),
}));
const {
  mockUseReleaseEntityQuery,
  mockUseReleasesQuery,
  mockUseContactsQuery,
  mockUseEventsQuery,
  mockUsePlanGate,
} = vi.hoisted(() => ({
  mockUseReleaseEntityQuery: vi.fn(),
  mockUseReleasesQuery: vi.fn(),
  mockUseContactsQuery: vi.fn(),
  mockUseEventsQuery: vi.fn(),
  mockUsePlanGate: vi.fn(),
}));
let mockPreviewPanelOpen = false;

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicWrapper(props: Record<string, unknown>) {
      return React.createElement('div', {
        'data-testid': 'dynamic-import-stub',
        ...props,
      });
    },
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: mockPreviewPanelOpen,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}));

vi.mock('@/lib/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();

  return {
    ...actual,
    usePlanGate: mockUsePlanGate,
    useCheckoutMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
  };
});

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: mockUseRegisterRightPanel,
}));

vi.mock('@/lib/queries/useReleaseEntityQuery', () => ({
  useReleaseEntityQuery: mockUseReleaseEntityQuery,
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: mockUseReleasesQuery,
}));

vi.mock('@/lib/queries/useContactsQuery', () => ({
  useContactsQuery: mockUseContactsQuery,
}));

vi.mock('@/lib/queries/useEventsQuery', () => ({
  useEventsQuery: mockUseEventsQuery,
}));

vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { readonly children: React.ReactNode }) =>
    children,
}));

vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => <div data-testid='profile-contact-sidebar' />,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src: string;
  }) => React.createElement('img', { alt, src }),
}));

function OpenReleaseTarget() {
  const { open } = useChatEntityPanel();

  useEffect(() => {
    open({
      kind: 'release',
      id: 'release-1',
      source: 'tool',
      focusKey: 'release-1',
    });
  }, [open]);

  return null;
}

function TargetLabel() {
  const { target } = useChatEntityPanel();
  return <div>{target?.kind ?? 'none'}</div>;
}

function OpenContactTarget() {
  const { open } = useChatEntityPanel();
  useEffect(() => {
    open({
      kind: 'contact',
      id: 'contact-1',
      source: 'tool',
      focusKey: 'contact-1',
    });
  }, [open]);
  return null;
}

function OpenTourDateTarget() {
  const { open } = useChatEntityPanel();
  useEffect(() => {
    open({
      kind: 'tour-date',
      id: 'evt_brooklyn',
      source: 'tool',
      focusKey: 'evt_brooklyn',
    });
  }, [open]);
  return null;
}

function UpsertProfileContext() {
  const { upsertContext } = useChatEntityPanel();
  useEffect(() => {
    upsertContext({
      kind: 'profile',
      id: 'profile-1',
      label: 'Tim White',
      source: 'tool',
      focusKey: 'tool-1:profile',
      toolCallId: 'tool-1',
    });
  }, [upsertContext]);
  return null;
}

function UpsertReleaseContext() {
  const { upsertContext } = useChatEntityPanel();
  useEffect(() => {
    upsertContext({
      kind: 'release',
      id: 'release-1',
      label: 'Lost In The Light',
      source: 'message',
      focusKey: 'message-1:release-1',
    });
  }, [upsertContext]);
  return null;
}

function UpsertTourDateContext() {
  const { upsertContext } = useChatEntityPanel();
  useEffect(() => {
    upsertContext({
      kind: 'tour-date',
      id: 'evt_brooklyn',
      label: 'Brooklyn Steel',
      source: 'message',
      focusKey: 'message-1:evt_brooklyn',
    });
  }, [upsertContext]);
  return null;
}

function UpsertTemplatePlaceholderContexts() {
  const { upsertContexts } = useChatEntityPanel();
  useEffect(() => {
    upsertContexts([
      {
        kind: 'release',
        id: 'release-1',
        label: '<title>',
        source: 'message',
        focusKey: 'message-1:release-1',
      },
      {
        kind: 'artist',
        id: 'artist-1',
        label: '<name>',
        source: 'message',
        focusKey: 'message-1:artist-1',
      },
      {
        kind: 'track',
        id: 'track-1',
        label: '<title>',
        source: 'message',
        focusKey: 'message-1:track-1',
      },
    ]);
  }, [upsertContexts]);
  return null;
}

function DismissContextHarness() {
  const { contextTargets, dismissContext, upsertContext } =
    useChatEntityPanel();

  useEffect(() => {
    upsertContext({
      kind: 'profile',
      id: 'profile-1',
      label: 'Tim White',
      source: 'tool',
      focusKey: 'tool-1:profile',
    });
  }, [upsertContext]);

  return (
    <div>
      <button type='button' onClick={() => dismissContext('tool-1:profile')}>
        Dismiss Context
      </button>
      {contextTargets.map(target => (
        <span key={target.focusKey}>{target.label}</span>
      ))}
    </div>
  );
}

function BatchContextOrderHarness() {
  const { contextTargets, upsertContexts } = useChatEntityPanel();

  const refreshContexts = useCallback(() => {
    upsertContexts([
      {
        kind: 'release',
        id: 'release-a',
        label: 'Release A',
        source: 'message',
        focusKey: 'message-1:release-a',
      },
      {
        kind: 'artist',
        id: 'artist-b',
        label: 'Artist B',
        source: 'tool',
        focusKey: 'tool-1:artist-b',
        toolCallId: 'tool-1',
      },
    ]);
  }, [upsertContexts]);

  useEffect(() => {
    refreshContexts();
  }, [refreshContexts]);

  return (
    <div>
      <button type='button' onClick={refreshContexts}>
        Refresh Contexts
      </button>
      <div data-testid='context-order'>
        {contextTargets.map(target => target.label).join(',')}
      </div>
    </div>
  );
}

describe('ChatEntityRightPanelHost', () => {
  beforeEach(() => {
    mockUseReleaseEntityQuery.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({ data: null, isLoading: false });
    mockUseReleasesQuery.mockClear();
    mockUseContactsQuery.mockClear();
    mockUseContactsQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseEventsQuery.mockClear();
    mockUseEventsQuery.mockReturnValue({ data: [], isLoading: false });
    mockUsePlanGate.mockClear();
    mockUsePlanGate.mockReturnValue({
      canAccessTasksWorkspace: false,
      isLoading: false,
    });
  });

  it('does not register the profile sidebar when preview is closed', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <ChatEntityRightPanelHost enablePreviewPanel />
      </ChatEntityPanelProvider>
    );

    const lastCall = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });

  it('registers the profile sidebar when preview is open', () => {
    mockPreviewPanelOpen = true;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <ChatEntityRightPanelHost enablePreviewPanel />
      </ChatEntityPanelProvider>
    );

    expect(mockUseRegisterRightPanel).toHaveBeenCalled();
    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();

    // Full-height rail host (no decorative card chrome) — JOV-3958
    render(registeredPanel as React.ReactElement);
    expect(screen.getByTestId('chat-profile-preview-rail')).toBeInTheDocument();
    expect(screen.getByTestId('dynamic-import-stub')).toBeInTheDocument();
  });

  it('registers the live profile sidebar when preview opens with profile context', () => {
    mockPreviewPanelOpen = true;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <ChatEntityRightPanelHost
          enablePreviewPanel
          profileContext={{
            id: 'profile-1',
            displayName: 'Tim White',
            username: 'tim',
            avatarUrl: null,
            completionPercentage: 72,
            hasMusicLinks: true,
            hasSocialLinks: false,
          }}
        />
      </ChatEntityPanelProvider>
    );

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();
    render(registeredPanel as React.ReactElement);

    expect(screen.getByTestId('dynamic-import-stub')).toBeInTheDocument();
  });

  it('tracks chat-owned entity targets through the provider', () => {
    render(
      <ChatEntityPanelProvider>
        <OpenReleaseTarget />
        <TargetLabel />
      </ChatEntityPanelProvider>
    );

    expect(screen.getByText('release')).toBeInTheDocument();
  });

  it('registers a release entity panel when the design v1 chat entity flag is enabled', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({
      data: {
        id: 'release-1',
        title: 'Lost In The Light',
        releaseType: 'single',
        status: 'released',
        slug: 'lost-in-the-light',
        smartLinkPath: '/r/lost-in-the-light',
        profileId: 'profile-1',
        totalTracks: 1,
        providers: [],
      },
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <OpenReleaseTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
          threadTitle='Release plan'
        />
      </ChatEntityPanelProvider>
    );

    expect(mockUseRegisterRightPanel).toHaveBeenCalled();
    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();

    render(registeredPanel as React.ReactElement);

    expect(mockUseReleaseEntityQuery).toHaveBeenCalledWith(
      'profile-1',
      'release-1'
    );
    expect(mockUseReleasesQuery).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('compact-release-plan-upgrade-card')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));
    expect(
      screen.queryByTestId('compact-release-plan-upgrade-card')
    ).not.toBeInTheDocument();
  });

  it('registers compact profile context cards without opening the full profile preview', async () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <UpsertProfileContext />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
          profileContext={{
            id: 'profile-1',
            displayName: 'Tim White',
            username: 'tim',
            avatarUrl: null,
            completionPercentage: 64,
          }}
        />
      </ChatEntityPanelProvider>
    );

    await waitFor(() => {
      expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
    });

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    render(registeredPanel as React.ReactElement);

    expect(
      screen.getByTestId('chat-rail-context-only-panel')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tim White').length).toBeGreaterThan(0);
    expect(screen.getByText('64% Complete')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-contact-sidebar')).toBeNull();
  });

  it('renders release context cards with the shared EntityCard compact treatment', async () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({
      data: {
        id: 'release-1',
        title: 'Lost In The Light',
        releaseType: 'single',
        status: 'released',
        slug: 'lost-in-the-light',
        smartLinkPath: '/r/lost-in-the-light',
        profileId: 'profile-1',
        totalTracks: 1,
        providers: [],
      },
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <UpsertReleaseContext />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    await waitFor(() => {
      expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
    });

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    render(registeredPanel as React.ReactElement);

    expect(
      screen.getByTestId('chat-rail-entity-card-release')
    ).toBeInTheDocument();
    expect(screen.getByText('Single Context')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Dismiss Release Context' })
    ).toBeInTheDocument();
  });

  it('never renders raw template placeholder tokens on context cards', async () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({ data: null, isLoading: false });

    render(
      <ChatEntityPanelProvider>
        <UpsertTemplatePlaceholderContexts />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    await waitFor(() => {
      expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
    });

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    render(registeredPanel as React.ReactElement);

    expect(screen.getByText('Release')).toBeInTheDocument();
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('Track')).toBeInTheDocument();
    expect(screen.queryByText('<title>')).toBeNull();
    expect(screen.queryByText('<name>')).toBeNull();
  });

  it('renders tour-date context cards with the shared EntityCard compact treatment', async () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseEventsQuery.mockReturnValue({
      data: [
        {
          id: 'evt_brooklyn',
          title: 'Brooklyn Steel',
          subtitle: 'Brooklyn, NY · Bandsintown',
          eventDate: '2026-06-12T23:30:00.000Z',
          eventType: 'tour',
          venue: 'Brooklyn Steel',
          city: 'Brooklyn, NY',
          provider: 'Bandsintown',
        },
      ],
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <UpsertTourDateContext />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    await waitFor(() => {
      expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
    });

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    render(registeredPanel as React.ReactElement);

    expect(
      screen.getByTestId('chat-rail-entity-card-tour-date')
    ).toBeInTheDocument();
    expect(screen.getByText('Tour Date Context')).toBeInTheDocument();
    expect(screen.getByText('Jun')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('stacks compact context cards above an open child entity panel', async () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({
      data: {
        id: 'release-1',
        title: 'Lost In The Light',
        releaseType: 'single',
        status: 'released',
        slug: 'lost-in-the-light',
        smartLinkPath: '/r/lost-in-the-light',
        profileId: 'profile-1',
        totalTracks: 1,
        providers: [],
      },
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <UpsertReleaseContext />
        <OpenReleaseTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
          threadTitle='Release plan'
        />
      </ChatEntityPanelProvider>
    );

    await waitFor(() => {
      expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
    });

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    render(registeredPanel as React.ReactElement);

    expect(
      screen.getByTestId('chat-rail-context-and-entity-panel')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Lost In The Light').length).toBeGreaterThan(1);
    expect(screen.getByTestId('chat-release-entity-panel')).toBeInTheDocument();
  });

  it('dismisses context cards without clearing the full entity target', async () => {
    render(
      <ChatEntityPanelProvider>
        <DismissContextHarness />
      </ChatEntityPanelProvider>
    );

    expect(await screen.findByText('Tim White')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Context' }));

    await waitFor(() => {
      expect(screen.queryByText('Tim White')).toBeNull();
    });
  });

  it('preserves batch context order when the same contexts upsert again', async () => {
    render(
      <ChatEntityPanelProvider>
        <BatchContextOrderHarness />
      </ChatEntityPanelProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('context-order')).toHaveTextContent(
        'Release A,Artist B'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Contexts' }));

    expect(screen.getByTestId('context-order')).toHaveTextContent(
      'Release A,Artist B'
    );
  });

  it('registers a contact entity panel backed by useContactsQuery', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseContactsQuery.mockReturnValue({
      data: [
        {
          id: 'contact-1',
          creatorProfileId: 'profile-1',
          role: 'manager',
          personName: 'Pat Manager',
          territories: ['NA'],
          email: 'pat@example.com',
          isActive: true,
          sortOrder: 0,
        },
      ],
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <OpenContactTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();
    render(registeredPanel as React.ReactElement);
    expect(mockUseContactsQuery).toHaveBeenCalledWith('profile-1');
    expect(screen.getByTestId('chat-contact-entity-panel')).toBeInTheDocument();
    expect(screen.getByText('Pat Manager')).toBeInTheDocument();
  });

  it('registers a tour-date entity panel backed by useEventsQuery', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseEventsQuery.mockReturnValue({
      data: [
        {
          id: 'evt_brooklyn',
          title: 'Brooklyn Steel',
          subtitle: 'Brooklyn, NY · Bandsintown',
          eventDate: '2026-06-12T23:30:00.000Z',
          eventType: 'tour',
          venue: 'Brooklyn Steel',
          city: 'Brooklyn, NY',
          provider: 'Bandsintown',
        },
      ],
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <OpenTourDateTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();
    render(registeredPanel as React.ReactElement);
    expect(mockUseEventsQuery).toHaveBeenCalledWith('profile-1');
    expect(
      screen.getByTestId('chat-tour-date-entity-panel')
    ).toBeInTheDocument();
    expect(screen.getByText('Brooklyn Steel')).toBeInTheDocument();
  });

  it('entity panel eyebrows carry the EntityCard-aligned CSS class on release panels', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({
      data: {
        id: 'release-1',
        title: 'Lost In The Light',
        releaseType: 'single',
        status: 'released',
        slug: 'lost-in-the-light',
        smartLinkPath: '/r/lost-in-the-light',
        profileId: 'profile-1',
        totalTracks: 1,
        providers: [],
      },
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <OpenReleaseTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();
    render(registeredPanel as React.ReactElement);

    const eyebrow = screen
      .getByTestId('chat-release-entity-panel')
      .querySelector('.system-b-chat-entity-panel-eyebrow');
    expect(eyebrow).not.toBeNull();
    expect(eyebrow?.textContent).toBe('Release');
  });

  it('entity panel eyebrows carry the EntityCard-aligned CSS class on contact panels', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseContactsQuery.mockReturnValue({
      data: [
        {
          id: 'contact-1',
          creatorProfileId: 'profile-1',
          role: 'manager',
          personName: 'Pat Manager',
          territories: ['NA'],
          email: 'pat@example.com',
          isActive: true,
          sortOrder: 0,
        },
      ],
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <OpenContactTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();
    render(registeredPanel as React.ReactElement);

    const eyebrow = screen
      .getByTestId('chat-contact-entity-panel')
      .querySelector('.system-b-chat-entity-panel-eyebrow');
    expect(eyebrow).not.toBeNull();
    expect(eyebrow?.textContent).toBe('Contact');
  });

  it('entity panel eyebrows carry the EntityCard-aligned CSS class on tour-date panels', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    mockUseEventsQuery.mockReturnValue({
      data: [
        {
          id: 'evt_brooklyn',
          title: 'Brooklyn Steel',
          subtitle: 'Brooklyn, NY · Bandsintown',
          eventDate: '2026-06-12T23:30:00.000Z',
          eventType: 'tour',
          venue: 'Brooklyn Steel',
          city: 'Brooklyn, NY',
          provider: 'Bandsintown',
        },
      ],
      isLoading: false,
    });

    render(
      <ChatEntityPanelProvider>
        <OpenTourDateTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );

    const registeredPanel = mockUseRegisterRightPanel.mock.calls.at(-1)?.[0];
    expect(registeredPanel).not.toBeNull();
    render(registeredPanel as React.ReactElement);

    const eyebrow = screen
      .getByTestId('chat-tour-date-entity-panel')
      .querySelector('.system-b-chat-entity-panel-eyebrow');
    expect(eyebrow).not.toBeNull();
    expect(eyebrow?.textContent).toBe('Tour date');
  });

  it('keeps the right rail empty when flag is off (no panel for contact target)', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();
    render(
      <ChatEntityPanelProvider>
        <OpenContactTarget />
        <ChatEntityRightPanelHost
          enablePreviewPanel={false}
          enableChatEntityPanels={false}
          profileId='profile-1'
        />
      </ChatEntityPanelProvider>
    );
    expect(mockUseRegisterRightPanel).toHaveBeenLastCalledWith(null);
  });
});
