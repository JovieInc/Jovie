import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dashboard = vi.hoisted(() => ({
  selectedProfile: {
    id: 'profile_admin',
    displayName: 'Admin Artist',
    avatarUrl: null,
    username: 'admin-artist',
  } as {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    username: string;
  } | null,
}));

const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.params,
}));

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return rtlRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: dashboard.selectedProfile,
    creatorProfiles: [],
  }),
}));

vi.mock('@/components/jovie/ChatWorkspaceSurface', () => ({
  ChatWorkspaceSurface: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='shared-chat-workspace'>{children}</div>
  ),
}));

vi.mock('@/components/features/admin/hud/OvieHomeCanvas', () => ({
  OvieHomeCanvas: () => <div data-testid='ovie-home-canvas' />,
}));

vi.mock('@/components/jovie/JovieChat', () => ({
  JovieChat: ({
    profileId,
    chatMode,
    homeCanvas,
    homeCanvasMode,
    ambientOwnedByShell,
    initialQuery,
  }: {
    readonly initialQuery?: string;
    readonly profileId?: string;
    readonly chatMode?: 'ov' | null;
    readonly homeCanvas?:
      | ReactNode
      | ((state: {
          messages: [];
          isStreaming: boolean;
          onOpenTranscript: () => void;
        }) => ReactNode);
    readonly homeCanvasMode?: string;
    readonly ambientOwnedByShell?: boolean;
  }) => (
    <div
      data-testid='shared-jovie-chat'
      data-profile-id={profileId}
      data-chat-mode={chatMode ?? undefined}
      data-home-canvas-mode={homeCanvasMode}
      data-ambient-owned-by-shell={ambientOwnedByShell}
      data-initial-query={initialQuery}
    >
      {typeof homeCanvas === 'function'
        ? homeCanvas({
            messages: [],
            isStreaming: false,
            onOpenTranscript: () => undefined,
          })
        : homeCanvas}
    </div>
  ),
}));

import { OvChatClient } from './OvChatClient';

describe('OvChatClient shared component ownership', () => {
  it('uses the shell canvas without painting a second background wash', () => {
    render(<OvChatClient />);
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-ambient-owned-by-shell',
      'true'
    );
  });
  afterEach(() => {
    dashboard.selectedProfile = {
      id: 'profile_admin',
      displayName: 'Admin Artist',
      avatarUrl: null,
      username: 'admin-artist',
    };
  });

  it('passes the OV mode and company Home canvas through the shared workspace', () => {
    render(<OvChatClient />);

    expect(screen.getByTestId('shared-chat-workspace')).toContainElement(
      screen.getByTestId('shared-jovie-chat')
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-chat-mode',
      'ov'
    );
    expect(screen.getByTestId('shared-jovie-chat')).toContainElement(
      screen.getByTestId('ovie-home-canvas')
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-home-canvas-mode',
      'living'
    );
  });

  it('renders founder OV chat without an artist profile', () => {
    dashboard.selectedProfile = null;
    render(<OvChatClient />);

    expect(screen.getByTestId('shared-chat-workspace')).toContainElement(
      screen.getByTestId('shared-jovie-chat')
    );
    expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
      'data-chat-mode',
      'ov'
    );
    expect(screen.getByTestId('shared-jovie-chat')).not.toHaveAttribute(
      'data-profile-id'
    );
  });

  it('starts a Summer conversation about a Discuss deep link, naming the decision', async () => {
    search.params = new URLSearchParams('discuss=summer-card%3Asc_1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          cases: [
            {
              id: 'summer-card:sc_1',
              title: 'Ship the agent connector legal pages',
              decisionDefault: null,
            },
          ],
          issues: [],
        })
      )
    );
    render(<OvChatClient />);
    await waitFor(() =>
      expect(screen.getByTestId('shared-jovie-chat')).toHaveAttribute(
        'data-initial-query',
        expect.stringContaining('"Ship the agent connector legal pages"')
      )
    );
    vi.unstubAllGlobals();
    search.params = new URLSearchParams();
  });

  it('ignores a malformed discuss parameter instead of sending its text', () => {
    search.params = new URLSearchParams('discuss=Say+something+rude');
    render(<OvChatClient />);
    expect(screen.getByTestId('shared-jovie-chat')).not.toHaveAttribute(
      'data-initial-query'
    );
    search.params = new URLSearchParams();
  });
});
