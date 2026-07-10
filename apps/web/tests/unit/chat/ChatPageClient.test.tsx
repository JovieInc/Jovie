import { screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatPageClient,
  resetWelcomeChatBootstrapState,
  shouldRetryWelcomeChatBootstrap,
} from '@/app/app/(shell)/chat/ChatPageClient';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { ChatActionCard } from '@/components/jovie/types';
import { APP_ROUTES } from '@/constants/routes';
import { fastRender } from '@/tests/utils/fast-render';

// Controllable mocks
const mockReplace = vi.fn();
const mockSetHeaderBadge = vi.fn();
const mockSetHeaderActions = vi.fn();
const mockSuccessNotification = vi.fn();
const mockErrorNotification = vi.fn();
const {
  mockClosePreviewPanel,
  mockOpenPreviewPanel,
  mockPreviewPanelState,
  mockSentryAddBreadcrumb,
  mockSentryCaptureMessage,
  mockSetPreviewData,
  mockTogglePreviewPanel,
  mockUseRegisterRightPanel,
} = vi.hoisted(() => ({
  mockClosePreviewPanel: vi.fn(),
  mockOpenPreviewPanel: vi.fn(),
  mockPreviewPanelState: { isOpen: false },
  mockSentryAddBreadcrumb: vi.fn(),
  mockSentryCaptureMessage: vi.fn(),
  mockSetPreviewData: vi.fn(),
  mockTogglePreviewPanel: vi.fn(),
  mockUseRegisterRightPanel: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();

function hasRegisteredRightPanel(): boolean {
  return mockUseRegisterRightPanel.mock.calls.some(([panel]) => panel !== null);
}

// Mock next/dynamic without kicking off real async imports. The chat panel
// tests only care whether a right panel registers, not the lazy component
// implementation behind that boundary.
vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicWrapper(props: Record<string, unknown>) {
      return React.createElement('div', {
        'data-testid': 'dynamic-import-stub',
        ...props,
      });
    },
}));

const mockRouter = {
  push: vi.fn(),
  replace: mockReplace,
  back: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/app/chat',
}));

vi.mock('@/lib/sentry/client-lite', () => ({
  addBreadcrumb: mockSentryAddBreadcrumb,
  captureMessage: mockSentryCaptureMessage,
}));

// Mock the HeaderActionsContext
vi.mock('@/contexts/HeaderActionsContext', () => ({
  useSetHeaderActions: () => ({
    setHeaderActions: mockSetHeaderActions,
    setHeaderBadge: mockSetHeaderBadge,
  }),
}));

// Track the onTitleChange callback from JovieChat
let capturedOnTitleChange: ((title: string | null) => void) | undefined;
let capturedOnConversationCreate:
  | ((id: string, phase?: 'reserved' | 'completed') => void)
  | undefined;
let capturedActionCards: readonly ChatActionCard[] | undefined;

vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: (props: {
    profileId?: string;
    conversationId?: string;
    onConversationCreate?: (id: string) => void;
    onTitleChange?: (title: string | null) => void;
    initialQuery?: string;
    isFirstSession?: boolean;
    actionCards?: readonly ChatActionCard[];
  }) => {
    capturedOnTitleChange = props.onTitleChange;
    capturedOnConversationCreate = props.onConversationCreate;
    capturedActionCards = props.actionCards;
    return React.createElement('div', {
      'data-testid': 'jovie-chat',
      'data-profile-id': props.profileId,
      'data-conversation-id': props.conversationId ?? '',
      'data-is-first-session': props.isFirstSession ? 'true' : 'false',
      'data-action-card-count': String(props.actionCards?.length ?? 0),
    });
  },
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: mockSuccessNotification,
    error: mockErrorNotification,
  }),
}));

vi.mock(
  '@/app/app/(shell)/dashboard/PreviewPanelContext',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('@/app/app/(shell)/dashboard/PreviewPanelContext')
      >();
    return {
      ...actual,
      usePreviewPanelData: () => ({
        previewData: null,
        setPreviewData: mockSetPreviewData,
      }),
      usePreviewPanelState: () => ({
        isOpen: mockPreviewPanelState.isOpen,
        open: mockOpenPreviewPanel,
        close: mockClosePreviewPanel,
        toggle: mockTogglePreviewPanel,
      }),
    };
  }
);

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: (...args: unknown[]) =>
    mockUseRegisterRightPanel(...args),
}));

vi.mock('@/lib/queries/useDashboardSocialLinksQuery', () => ({
  useDashboardSocialLinksQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useChatMutations', () => ({
  useDeleteConversationMutation: () => ({ mutateAsync: vi.fn() }),
  useCreateConversationMutation: () => ({ mutateAsync: vi.fn() }),
  useAddMessagesMutation: () => ({ mutateAsync: vi.fn() }),
}));

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [
    {
      id: 'profile-1',
      displayName: 'Test Artist',
      username: 'testartist',
    } as DashboardData['creatorProfiles'][0],
  ],
  selectedProfile: {
    id: 'profile-1',
    displayName: 'Test Artist',
    username: 'testartist',
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 57,
    completedCount: 4,
    totalCount: 6,
    steps: [],
    profileIsLive: true,
  },
};

function renderChatPage(conversationId?: string, isFirstSession?: boolean) {
  return fastRender(
    <DashboardDataProvider value={baseDashboardData}>
      <ChatPageClient
        conversationId={conversationId}
        isFirstSession={isFirstSession}
      />
    </DashboardDataProvider>
  );
}

describe('ChatPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockSearchParams = new URLSearchParams();
    capturedOnTitleChange = undefined;
    capturedActionCards = undefined;
    mockSuccessNotification.mockReset();
    mockErrorNotification.mockReset();
    mockSetPreviewData.mockReset();
    mockPreviewPanelState.isOpen = false;
    globalThis.sessionStorage.clear();
    capturedOnConversationCreate = undefined;
  });

  it('renders JovieChat with profileId from selected profile', () => {
    const { getByTestId } = renderChatPage();
    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-profile-id')).toBe('profile-1');
  });

  it('passes ≥3 profile-aware action cards to new chat threads (JOV-3547)', () => {
    const { getByTestId } = renderChatPage();
    const chat = getByTestId('jovie-chat');

    expect(chat.getAttribute('data-action-card-count')).toBe('3');
    expect(capturedActionCards).toHaveLength(3);
    expect(capturedActionCards?.[0]).toEqual(
      expect.objectContaining({
        id: 'connect-music-catalog',
        title: 'Connect Your Music Catalog',
        actionLabel: 'Plan Setup',
        prompt:
          'Help me connect my music catalog for Test Artist. Use the current profile context and give me the next setup step.',
      })
    );
    expect(capturedActionCards?.map(card => card.id)).toEqual([
      'connect-music-catalog',
      'plan-release',
      'generate-album-art',
    ]);
  });

  it('seeds starter action cards when catalog is connected and profile is complete', () => {
    const dataWithConnectedMusic: DashboardData = {
      ...baseDashboardData,
      hasMusicLinks: false,
      selectedProfile: {
        ...baseDashboardData.selectedProfile!,
        spotifyId: 'spotify-artist-123',
      } as DashboardData['selectedProfile'],
      profileCompletion: {
        percentage: 100,
        completedCount: 4,
        totalCount: 4,
        steps: [],
        profileIsLive: true,
      },
    };

    fastRender(
      <DashboardDataProvider value={dataWithConnectedMusic}>
        <ChatPageClient />
      </DashboardDataProvider>
    );

    // Fully set-up profiles still get ≥3 grounded starters (no setup-gap lead).
    expect(capturedActionCards).toHaveLength(3);
    expect(capturedActionCards?.map(card => card.id)).toEqual([
      'plan-release',
      'generate-album-art',
      'whats-working',
    ]);
  });

  it('passes conversationId to JovieChat', () => {
    const { getByTestId } = renderChatPage('conv-123');
    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-conversation-id')).toBe('conv-123');
  });

  it('uses history.replaceState for the first conversation on the chat root', () => {
    window.history.replaceState({}, '', APP_ROUTES.CHAT);
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    try {
      renderChatPage();

      expect(capturedOnConversationCreate).toBeDefined();
      capturedOnConversationCreate?.('conv-123');

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      expect(replaceStateSpy.mock.calls[0]?.[1]).toBe('');
      expect(replaceStateSpy.mock.calls[0]?.[2]).toBe(
        `${APP_ROUTES.CHAT}/conv-123`
      );
      expect(mockReplace).not.toHaveBeenCalled();
    } finally {
      replaceStateSpy.mockRestore();
    }
  });

  it('marks no-conversation route as first session', () => {
    const { getByTestId } = renderChatPage(undefined, true);
    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-is-first-session')).toBe('true');
  });

  it('marks conversation route as not first session', () => {
    const { getByTestId } = renderChatPage('conv-123');
    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-is-first-session')).toBe('false');
  });

  it('passes onTitleChange callback to JovieChat', () => {
    renderChatPage('conv-123');
    expect(capturedOnTitleChange).toBeDefined();
  });

  it('seeds the header badge from the server thread title on mount', () => {
    fastRender(
      <DashboardDataProvider value={baseDashboardData}>
        <ChatPageClient
          conversationId='conv-123'
          initialConversationTitle='Release Planning Conversation'
        />
      </DashboardDataProvider>
    );

    expect(mockSetHeaderBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          title: 'Release Planning Conversation',
        }),
      })
    );
  });

  it('sets header badge when title changes to non-null', async () => {
    renderChatPage('conv-123');
    expect(capturedOnTitleChange).toBeDefined();

    // Simulate title change from the chat hook
    capturedOnTitleChange!('My New Chat Title');

    await waitFor(() => {
      expect(mockSetHeaderBadge).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({ title: 'My New Chat Title' }),
        })
      );
    });
  });

  it('clears header badge when title changes to null', () => {
    renderChatPage('conv-123');
    expect(capturedOnTitleChange).toBeDefined();

    capturedOnTitleChange!(null);

    expect(mockSetHeaderBadge).toHaveBeenCalledWith(null);
  });

  it('cleans up header badge on unmount', () => {
    const { unmount } = renderChatPage('conv-123');

    // Clear previous calls
    mockSetHeaderBadge.mockClear();

    unmount();

    // Should set badge to null on cleanup
    expect(mockSetHeaderBadge).toHaveBeenCalledWith(null);
  });

  it('registers header actions on mount', () => {
    renderChatPage('conv-123');

    const headerActions = mockSetHeaderActions.mock.calls.at(-1)?.[0];

    expect(headerActions).not.toBeNull();
    expect(headerActions).toEqual(
      expect.objectContaining({
        type: expect.anything(),
      })
    );
  });

  it('registers the artist profile rail toggle on the new-chat route', () => {
    renderChatPage();

    const headerActions = mockSetHeaderActions.mock.calls.at(-1)?.[0];
    expect(headerActions).not.toBeNull();
    expect(headerActions).toEqual(
      expect.objectContaining({
        type: expect.anything(),
      })
    );
  });

  it('hydrates preview data on chat and registers the live profile panel when preview is open', () => {
    mockPreviewPanelState.isOpen = true;

    renderChatPage();

    expect(mockUseRegisterRightPanel).toHaveBeenCalled();
    expect(hasRegisteredRightPanel()).toBe(true);
    expect(mockSetPreviewData).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'testartist',
      })
    );
  });

  it('does not register a right panel when the preview panel is closed', () => {
    mockPreviewPanelState.isOpen = false;

    renderChatPage();

    expect(hasRegisteredRightPanel()).toBe(false);
  });

  it('preserves profile panel deep-link hydration and opens the panel from the query param', () => {
    mockSearchParams = new URLSearchParams('panel=profile');
    mockPreviewPanelState.isOpen = false;

    const { rerender } = renderChatPage();

    expect(mockOpenPreviewPanel).toHaveBeenCalledTimes(1);

    mockPreviewPanelState.isOpen = true;
    rerender(
      <DashboardDataProvider value={baseDashboardData}>
        <ChatPageClient />
      </DashboardDataProvider>
    );

    expect(hasRegisteredRightPanel()).toBe(true);
  });

  it('cleans up header actions on unmount', () => {
    const { unmount } = renderChatPage('conv-123');

    mockSetHeaderActions.mockClear();

    unmount();

    expect(mockSetHeaderActions).toHaveBeenCalledWith(null);
  });

  it('shows retry state when no profile data is available', () => {
    const dataWithoutProfile: DashboardData = {
      ...baseDashboardData,
      creatorProfiles: [],
      selectedProfile: null,
    };

    const { container } = fastRender(
      <DashboardDataProvider value={dataWithoutProfile}>
        <ChatPageClient />
      </DashboardDataProvider>
    );

    // Should show retry state, not JovieChat
    expect(container.querySelector('[data-testid="jovie-chat"]')).toBeNull();
    expect(container.textContent).toContain(
      'We hit a problem loading your profile. Please retry in a moment.'
    );
    const retryButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Retry'
    );
    expect(retryButton).toBeDefined();
    expect(mockSentryAddBreadcrumb).toHaveBeenCalled();
  });

  it('uses the first creator profile when selectedProfile is temporarily null', () => {
    const dataWithoutSelection: DashboardData = {
      ...baseDashboardData,
      selectedProfile: null,
    };

    const { getByTestId, container } = fastRender(
      <DashboardDataProvider value={dataWithoutSelection}>
        <ChatPageClient />
      </DashboardDataProvider>
    );

    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-profile-id')).toBe('profile-1');
    expect(container.textContent).not.toContain(
      'Finishing your dashboard setup…'
    );
  });

  it('shows load failed message when dashboard load error exists', () => {
    const dataWithoutProfile: DashboardData = {
      ...baseDashboardData,
      creatorProfiles: [],
      selectedProfile: null,
      dashboardLoadError: {
        stage: 'core_fetch',
        message: 'DB timeout',
        code: 'QUERY_TIMEOUT',
        errorType: 'QueryTimeoutError',
      },
    };

    const { container } = fastRender(
      <DashboardDataProvider value={dataWithoutProfile}>
        <ChatPageClient />
      </DashboardDataProvider>
    );

    expect(container.textContent).toContain(
      'We hit a problem loading your profile. Please retry in a moment.'
    );
    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      'Chat selectedProfile missing due to dashboard load failure',
      expect.any(Object)
    );
  });

  it('treats onboarding profile-missing 404s as retryable', () => {
    expect(shouldRetryWelcomeChatBootstrap(404)).toBe(true);
  });

  it('resets scheduled bootstrap state during cleanup', () => {
    const stateRef = { current: 'scheduled' as const };
    const retryCountRef = { current: 2 };

    resetWelcomeChatBootstrapState(stateRef, retryCountRef);

    expect(stateRef.current).toBe('idle');
    expect(retryCountRef.current).toBe(0);
  });

  it('announces welcome chat bootstrap progress without changing layout', async () => {
    mockSearchParams = new URLSearchParams('from=onboarding');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );

    renderChatPage();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Starting your onboarding chat.'
    );
  });

  it('does not show a destructive toast after welcome chat bootstrap retries exhaust', async () => {
    vi.useFakeTimers();
    mockSearchParams = new URLSearchParams('from=onboarding');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(null, {
            status: 503,
            statusText: 'Service Unavailable',
          })
        )
      )
    );

    renderChatPage();

    // 1500 + 3000 + 5000ms retry delays, plus buffer for fetch microtasks.
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.runOnlyPendingTimersAsync();

    expect(mockErrorNotification).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
