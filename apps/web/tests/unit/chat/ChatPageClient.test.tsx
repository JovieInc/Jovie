import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPageClient } from '@/app/app/(shell)/chat/ChatPageClient';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { fastRender } from '@/tests/utils/fast-render';

// Controllable mocks
const mockReplace = vi.fn();
const mockSetHeaderBadge = vi.fn();
const mockSetHeaderActions = vi.fn();

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/app/chat',
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
  }) => {
    capturedOnTitleChange = props.onTitleChange;
    return React.createElement('div', {
      'data-testid': 'jovie-chat',
      'data-profile-id': props.profileId,
      'data-conversation-id': props.conversationId ?? '',
    });
  },
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
};

function renderChatPage(conversationId?: string) {
  return fastRender(
    <DashboardDataProvider value={baseDashboardData}>
      <ChatPageClient conversationId={conversationId} />
    </DashboardDataProvider>
  );
}

describe('ChatPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    capturedOnTitleChange = undefined;
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

  it('shows loading state when no profile is selected', () => {
    const dataWithoutProfile: DashboardData = {
      ...baseDashboardData,
      selectedProfile: null,
    };

    const { container } = fastRender(
      <DashboardDataProvider value={dataWithoutProfile}>
        <ChatPageClient />
      </DashboardDataProvider>
    );

    // Should show spinner, not JovieChat
    expect(container.querySelector('[data-testid="jovie-chat"]')).toBeNull();
  });
});
