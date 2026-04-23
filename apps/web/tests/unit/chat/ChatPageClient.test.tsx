import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatPageClient,
  resetWelcomeChatBootstrapState,
  shouldRetryWelcomeChatBootstrap,
} from '@/app/app/(shell)/chat/ChatPageClient';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
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

vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: (props: {
    profileId?: string;
    conversationId?: string;
    onConversationCreate?: (id: string) => void;
    onTitleChange?: (title: string | null) => void;
    initialQuery?: string;
    isFirstSession?: boolean;
  }) => {
    capturedOnTitleChange = props.onTitleChange;
    return React.createElement('div', {
      'data-testid': 'jovie-chat',
      'data-profile-id': props.profileId,
      'data-conversation-id': props.conversationId ?? '',
      'data-is-first-session': props.isFirstSession ? 'true' : 'false',
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

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: true }),
  StatsigContext: React.createContext({ client: {} }),
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
    mockSuccessNotification.mockReset();
    mockErrorNotification.mockReset();
    mockSetPreviewData.mockReset();
    mockPreviewPanelState.isOpen = false;
    globalThis.sessionStorage.clear();
  });

  it('renders JovieChat with profileId from selected profile', () => {
    const { getByTestId } = renderChatPage();
    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-profile-id')).toBe('profile-1');
  });

  it('passes conversationId to JovieChat', () => {
    const { getByTestId } = renderChatPage('conv-123');
    const chat = getByTestId('jovie-chat');
    expect(chat.getAttribute('data-conversation-id')).toBe('conv-123');
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

  it('sets header badge when title changes to non-null', () => {
    renderChatPage('conv-123');
    expect(capturedOnTitleChange).toBeDefined();

    // Simulate title change from the chat hook
    capturedOnTitleChange!('My New Chat Title');

    expect(mockSetHeaderBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ title: 'My New Chat Title' }),
      })
    );
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

  it('does not register chat header actions on the new-thread route', () => {
    renderChatPage();

    expect(mockSetHeaderActions).toHaveBeenCalledWith(null);
  });

  it('hydrates the profile right panel when preview state is open without a panel query', () => {
    mockPreviewPanelState.isOpen = true;

    renderChatPage();

    expect(mockUseRegisterRightPanel).toHaveBeenCalled();
    expect(hasRegisteredRightPanel()).toBe(true);
  });

  it('clears preview data while profile panel hydration is inactive', () => {
    mockPreviewPanelState.isOpen = false;

    renderChatPage();

    expect(hasRegisteredRightPanel()).toBe(false);
    expect(mockSetPreviewData).toHaveBeenCalledWith(null);
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
});
