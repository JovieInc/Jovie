/**
 * Tests for the global Cmd+K shell that wraps CmdKPalette.
 *
 * Asserts: the palette stays mounted (no-op) when there's no DashboardData
 * context, opens on Cmd+K, surfaces recent threads from the conversations
 * query, and renders the autofocused search input.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CommandPalette } from '@/components/organisms/CommandPalette';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid='img' data-src={src} data-alt={alt} />
  ),
}));

vi.mock('@jovie/ui', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role='dialog'>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Title: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Description: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    useChatConversationsQuery: () => ({
      data: [
        { id: 'thread-a', title: 'Q1 release plan' },
        { id: 'thread-b', title: null },
      ],
      isLoading: false,
    }),
  };
});

function makeDashboard(): DashboardData {
  return {
    user: { id: 'user-1' },
    creatorProfiles: [],
    selectedProfile: { id: 'profile-1' } as DashboardData['selectedProfile'],
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
    tippingStats: {
      tipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
    profileCompletion: {
      percentage: 0,
      completedCount: 0,
      totalCount: 0,
      steps: [],
      profileIsLive: false,
    },
  };
}

function withDashboard(node: ReactNode) {
  return (
    <DashboardDataContext.Provider value={makeDashboard()}>
      {node}
    </DashboardDataContext.Provider>
  );
}

describe('CommandPalette', () => {
  it('renders nothing when DashboardDataContext is missing', () => {
    const { container } = render(<CommandPalette />);
    expect(container.firstChild).toBeNull();
  });

  it('opens on Cmd+K and shows the autofocused search input', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    const input = screen.getByLabelText('Command palette search');
    expect(input).toBeInTheDocument();
    // React applies autofocus by calling .focus() on mount, not by emitting
    // the deprecated HTML attribute — assert focus state instead.
    expect(input).toHaveFocus();
  });

  it('lists recent threads with safe fallback titles', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(screen.getByText('Recent threads')).toBeInTheDocument();
    expect(screen.getByText('Q1 release plan')).toBeInTheDocument();
    expect(screen.getByText('Untitled thread')).toBeInTheDocument();
  });

  it('routes a recent-thread commit to the chat route', () => {
    pushMock.mockClear();
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    const threadRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Q1 release plan'));
    expect(threadRow).toBeDefined();
    fireEvent.mouseDown(threadRow!);
    expect(pushMock).toHaveBeenCalledWith('/app/chat/thread-a');
  });

  it('toggles closed when Cmd+K is pressed again', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(
      screen.queryByLabelText('Command palette search')
    ).toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(
      screen.queryByLabelText('Command palette search')
    ).not.toBeInTheDocument();
  });
});
