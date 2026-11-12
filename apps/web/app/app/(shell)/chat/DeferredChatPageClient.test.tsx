import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const chat = vi.hoisted(() => ({ shouldThrow: false }));

// The chat surface, routing and data hooks are certified on their own. These
// stubs keep the route shell (fallbacks, error boundary) as the unit under test.
vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: (props: { profileId?: string; conversationId?: string }) => {
    if (chat.shouldThrow) throw new Error('simulated chat render failure');
    return (
      <section
        aria-label='Chat'
        data-testid='jovie-chat'
        data-profile-id={props.profileId}
        data-conversation-id={props.conversationId ?? ''}
      />
    );
  },
}));
// ChatPageClient loads JovieChat through DeferredJovieChat's own chunk; point
// that boundary at the stub above so the route shell renders it directly.
vi.mock(
  '@/app/app/(shell)/chat/DeferredJovieChat',
  () => import('@/components/jovie/JovieChat')
);
vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicStub(props: Record<string, unknown>) {
      return React.createElement('div', {
        'data-testid': 'dynamic-import-stub',
        ...props,
      });
    },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/chat',
}));
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  )),
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/lib/sentry/client-lite', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('@/contexts/HeaderActionsContext', () => ({
  useSetHeaderActions: () => ({
    setHeaderActions: vi.fn(),
    setHeaderBadge: vi.fn(),
  }),
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock(
  '@/app/app/(shell)/dashboard/PreviewPanelContext',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/app/app/(shell)/dashboard/PreviewPanelContext')
    >()),
    usePreviewPanelData: () => ({ previewData: null, setPreviewData: vi.fn() }),
    usePreviewPanelState: () => ({
      isOpen: false,
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
    }),
  })
);
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));
vi.mock('@/lib/queries/useDashboardSocialLinksQuery', () => ({
  useDashboardSocialLinksQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/lib/queries/useChatMutations', () => ({
  useDeleteConversationMutation: () => ({ mutateAsync: vi.fn() }),
  useCreateConversationMutation: () => ({ mutateAsync: vi.fn() }),
  useAddMessagesMutation: () => ({ mutateAsync: vi.fn() }),
}));

import { ChatPageClient } from './ChatPageClient';
import { DeferredChatPageClient } from './DeferredChatPageClient';

const profile = {
  id: 'profile-1',
  displayName: 'Test Artist',
  username: 'testartist',
} as DashboardData['selectedProfile'];

const dashboard: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [profile as DashboardData['creatorProfiles'][0]],
  selectedProfile: profile,
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

function renderChat(data: DashboardData = dashboard, conversationId?: string) {
  return render(
    <DashboardDataProvider value={data}>
      <DeferredChatPageClient conversationId={conversationId} />
    </DashboardDataProvider>
  );
}

describe('DeferredChatPageClient', () => {
  beforeEach(() => {
    chat.shouldThrow = false;
    globalThis.sessionStorage.clear();
  });

  it('is the chat route client both /app/chat routes render', () => {
    expect(DeferredChatPageClient).toBe(ChatPageClient);
  });

  it('mounts the chat for the selected profile and is axe-clean', async () => {
    const { container } = renderChat(dashboard, 'conv-123');

    const surface = screen.getByTestId('jovie-chat');
    expect(surface).toHaveAttribute('data-profile-id', 'profile-1');
    expect(surface).toHaveAttribute('data-conversation-id', 'conv-123');
    await expectNoA11yViolations(container);
  });

  it('offers one retry when the profile is missing and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderChat({
      ...dashboard,
      creatorProfiles: [],
      selectedProfile: null,
    });

    expect(screen.queryByTestId('jovie-chat')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-profile-error-state')).toHaveTextContent(
      'We hit a problem loading your profile. Please retry in a moment.'
    );
    const retry = screen.getByRole('button', { name: 'Try again' });
    await user.tab();
    expect(retry).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('contains a chat render failure in an accessible error state', async () => {
    chat.shouldThrow = true;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { container } = renderChat();

    expect(screen.getByTestId('chat-error-state')).toHaveTextContent(
      'Something went wrong loading chat. Please try again.'
    );
    await expectNoA11yViolations(container);
    consoleError.mockRestore();
  });
});
