import { render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
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
} = vi.hoisted(() => ({
  mockUseReleaseEntityQuery: vi.fn(),
  mockUseReleasesQuery: vi.fn(),
  mockUseContactsQuery: vi.fn(),
  mockUseEventsQuery: vi.fn(),
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

describe('ChatEntityRightPanelHost', () => {
  beforeEach(() => {
    mockUseReleaseEntityQuery.mockClear();
    mockUseReleaseEntityQuery.mockReturnValue({ data: null, isLoading: false });
    mockUseReleasesQuery.mockClear();
    mockUseContactsQuery.mockClear();
    mockUseContactsQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseEventsQuery.mockClear();
    mockUseEventsQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it('registers no right panel when preview is closed', () => {
    mockPreviewPanelOpen = false;
    mockUseRegisterRightPanel.mockClear();

    render(
      <ChatEntityPanelProvider>
        <ChatEntityRightPanelHost enablePreviewPanel />
      </ChatEntityPanelProvider>
    );

    expect(mockUseRegisterRightPanel).toHaveBeenLastCalledWith(null);
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
    expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();
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
